import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Capa de estado efímero y pub/sub.
 *
 * Con REDIS_URL usa Redis (presencia, sesiones de sala, eventos entre nodos).
 * Sin Redis cae a una implementación en memoria equivalente, válida para una
 * sola instancia — así el proyecto arranca sin infraestructura y escala
 * horizontalmente sin cambiar el código que lo consume.
 */

export interface EphemeralStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, ttlSeconds: number): Promise<void>;
}

export interface MessageBus {
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, handler: (payload: any) => void): Promise<void>;
}

class MemoryStore implements EphemeralStore {
  private values = new Map<string, { value: string; expiresAt?: number }>();
  private hashes = new Map<string, Map<string, string>>();
  private sets = new Map<string, Set<string>>();
  private timers = new Map<string, NodeJS.Timeout>();

  private alive(key: string) {
    const entry = this.values.get(key);
    if (entry?.expiresAt && entry.expiresAt < Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.alive(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    this.values.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string) {
    this.values.delete(key);
    this.hashes.delete(key);
    this.sets.delete(key);
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? new Map());
  }

  async hset(key: string, field: string, value: string) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
  }

  async hdel(key: string, field: string) {
    this.hashes.get(key)?.delete(field);
  }

  async sadd(key: string, member: string) {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
  }

  async srem(key: string, member: string) {
    this.sets.get(key)?.delete(member);
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }

  async expire(key: string, ttlSeconds: number) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => void this.del(key), ttlSeconds * 1000);
    timer.unref?.();
    this.timers.set(key, timer);
  }
}

class MemoryBus implements MessageBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  async publish(channel: string, payload: unknown) {
    this.emitter.emit(channel, payload);
  }

  async subscribe(channel: string, handler: (payload: any) => void) {
    this.emitter.on(channel, handler);
  }
}

class RedisStore implements EphemeralStore {
  constructor(private client: Redis) {}

  async get(key: string) {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }
  async del(key: string) {
    await this.client.del(key);
  }
  async hgetall(key: string) {
    return this.client.hgetall(key);
  }
  async hset(key: string, field: string, value: string) {
    await this.client.hset(key, field, value);
  }
  async hdel(key: string, field: string) {
    await this.client.hdel(key, field);
  }
  async sadd(key: string, member: string) {
    await this.client.sadd(key, member);
  }
  async srem(key: string, member: string) {
    await this.client.srem(key, member);
  }
  async smembers(key: string) {
    return this.client.smembers(key);
  }
  async expire(key: string, ttlSeconds: number) {
    await this.client.expire(key, ttlSeconds);
  }
}

class RedisBus implements MessageBus {
  constructor(
    private pub: Redis,
    private sub: Redis,
  ) {
    this.sub.on('message', (channel, raw) => {
      const handlers = this.handlers.get(channel);
      if (!handlers) return;
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = raw;
      }
      for (const handler of handlers) handler(payload);
    });
  }

  private handlers = new Map<string, ((payload: any) => void)[]>();

  async publish(channel: string, payload: unknown) {
    await this.pub.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string, handler: (payload: any) => void) {
    const existing = this.handlers.get(channel);
    if (existing) {
      existing.push(handler);
      return;
    }
    this.handlers.set(channel, [handler]);
    await this.sub.subscribe(channel);
  }
}

let store: EphemeralStore;
let bus: MessageBus;
let redisClients: Redis[] = [];

if (env.REDIS_URL) {
  const main = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  const sub = main.duplicate();
  main.on('error', (err) => logger.error({ err }, 'Error de Redis'));
  sub.on('error', (err) => logger.error({ err }, 'Error de Redis (sub)'));
  redisClients = [main, sub];
  store = new RedisStore(main);
  bus = new RedisBus(main, sub);
  logger.info('Estado efímero: Redis');
} else {
  store = new MemoryStore();
  bus = new MemoryBus();
  logger.warn('REDIS_URL no configurado: usando almacén en memoria (una sola instancia)');
}

export const ephemeral = store;
export const messageBus = bus;
export const redisEnabled = Boolean(env.REDIS_URL);

export async function closeRedis() {
  await Promise.all(redisClients.map((client) => client.quit().catch(() => undefined)));
}
