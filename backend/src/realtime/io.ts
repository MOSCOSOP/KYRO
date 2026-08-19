import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@kyro/shared';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { messageBus } from '../lib/redis.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { prisma } from '../lib/prisma.js';
import { registerConversationHandlers } from './handlers/conversations.js';
import { registerPresenceHandlers } from './handlers/presence.js';
import { registerRoomHandlers } from './handlers/rooms.js';
import { registerCallHandlers } from './handlers/calls.js';
import { markOffline, markOnline } from './presence.js';
import { broadcastPresence } from './broadcast.js';
import { leaveCurrentRoom, roomParticipants } from './rooms.js';
import { leaveContext } from './context.js';

export interface SocketData {
  userId: string;
  username: string;
}

export type KyroSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
export type KyroServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

let io: KyroServer | null = null;

/** Canal del bus por el que viajan todas las emisiones entre instancias. */
const EMIT_CHANNEL = 'kyro:emit';

interface EmitEnvelope {
  targets: { kind: 'user' | 'room'; ids: string[] };
  event: string;
  payload: unknown;
  exclude?: string[];
}

export function getIO(): KyroServer {
  if (!io) throw new Error('El servidor de tiempo real no está inicializado');
  return io;
}

export function userRoom(userId: string) {
  return `user:${userId}`;
}

export function conversationRoom(conversationId: string) {
  return `conv:${conversationId}`;
}

export function voiceRoomChannel(roomId: string) {
  return `room:${roomId}`;
}

export async function initRealtime(server: HttpServer) {
  io = new Server(server, {
    path: '/realtime',
    cors: { origin: env.corsOrigins, credentials: true },
    serveClient: false,
    pingInterval: 20000,
    pingTimeout: 25000,
    maxHttpBufferSize: 1e6,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, status: true },
      });
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      socket.data.username = user.username;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId } = socket.data;

    /*
     * Los manejadores se registran antes de cualquier espera. Socket.IO no
     * guarda los eventos que llegan sin oyente: si el cliente emite nada más
     * conectar —entrar en una sala, iniciar una llamada— y aquí todavía se
     * estuviera consultando la base de datos, ese evento se perdería sin dejar
     * rastro.
     */
    registerConversationHandlers(socket);
    registerPresenceHandlers(socket);
    registerRoomHandlers(socket);
    registerCallHandlers(socket);

    await socket.join(userRoom(userId));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    await markOnline(userId, (user?.status as never) ?? 'available');
    await broadcastPresence(userId);

    socket.emit('connection:ready', { userId, serverTime: new Date().toISOString() });

    socket.on('disconnect', async (reason) => {
      try {
        const { connections } = await markOffline(userId);
        if (connections === 0) {
          const roomId = await leaveCurrentRoom(userId);
          if (roomId) {
            await leaveContext(userId, 'room');
            emit({ targets: { kind: 'room', ids: [voiceRoomChannel(roomId)] } , event: 'room:peer-left', payload: { roomId, userId } });
            const participants = await roomParticipants(roomId);
            emit({
              targets: { kind: 'room', ids: [voiceRoomChannel(roomId)] },
              event: 'room:state',
              payload: { roomId, participants },
            });
          }
          await prisma.user.update({
            where: { id: userId },
            data: { lastSeenAt: new Date() },
          }).catch(() => undefined);
          await broadcastPresence(userId);
        }
      } catch (err) {
        logger.error({ err, reason }, 'Error al desconectar socket');
      }
    });
  });

  // Toda emisión pasa por el bus: con Redis funciona entre instancias,
  // sin Redis se resuelve en el mismo proceso.
  await messageBus.subscribe(EMIT_CHANNEL, (envelope: EmitEnvelope) => {
    if (!io) return;
    const rooms =
      envelope.targets.kind === 'user'
        ? envelope.targets.ids.map(userRoom)
        : envelope.targets.ids;
    let channel = io.to(rooms);
    for (const excluded of envelope.exclude ?? []) channel = channel.except(userRoom(excluded));
    // El nombre del evento llega como string desde el bus; el tipado fuerte
    // se aplica en `broadcast.ts`, que es la única puerta de entrada.
    const loose = channel as unknown as { emit(event: string, payload: unknown): void };
    loose.emit(envelope.event, envelope.payload);
  });

  logger.info('Servidor de tiempo real listo en /realtime');
  return io;
}

export function emit(envelope: EmitEnvelope) {
  void messageBus.publish(EMIT_CHANNEL, envelope);
}

export async function shutdownRealtime() {
  await io?.close();
  io = null;
}
