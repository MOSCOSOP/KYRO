import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@kyro/shared';
import { PRESENCE_HEARTBEAT_MS } from '@kyro/shared';
import { API_ORIGIN, getAccessToken } from './api';

export type KyroSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

let socket: KyroSocket | null = null;
let heartbeat: number | null = null;
const stateListeners = new Set<(state: ConnectionState) => void>();
let currentState: ConnectionState = 'idle';

function setState(state: ConnectionState) {
  if (currentState === state) return;
  currentState = state;
  for (const listener of stateListeners) listener(state);
}

export function onConnectionState(listener: (state: ConnectionState) => void) {
  stateListeners.add(listener);
  listener(currentState);
  return () => {
    stateListeners.delete(listener);
  };
}

export function getConnectionState() {
  return currentState;
}

/**
 * Abre (o reutiliza) la conexión de tiempo real. La reconexión es automática
 * con espera creciente; al reconectar, el token se vuelve a leer para que una
 * sesión renovada no deje el socket colgado.
 */
export function connectSocket(): KyroSocket {
  if (socket) return socket;

  setState('connecting');
  // Sin origen configurado se conecta al mismo dominio que sirve la aplicación.
  socket = io(API_ORIGIN || undefined, {
    path: '/realtime',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: (callback) => callback({ token: getAccessToken() }),
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    timeout: 12000,
  });

  socket.on('connect', () => {
    setState('connected');
    startHeartbeat();
  });

  socket.on('disconnect', (reason) => {
    stopHeartbeat();
    setState(reason === 'io client disconnect' ? 'idle' : 'reconnecting');
  });

  socket.io.on('reconnect_attempt', () => setState('reconnecting'));
  socket.io.on('error', () => setState('offline'));

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  stopHeartbeat();
  socket?.disconnect();
  socket = null;
  setState('idle');
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeat = window.setInterval(() => {
    socket?.emit('presence:heartbeat');
  }, PRESENCE_HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeat !== null) {
    window.clearInterval(heartbeat);
    heartbeat = null;
  }
}
