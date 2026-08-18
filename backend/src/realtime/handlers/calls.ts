import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';
import type { KyroSocket } from '../io.js';
import {
  acceptCall,
  declineCall,
  hangupCall,
  releaseUserCalls,
  startCall,
} from '../../modules/calls/service.js';

function reason(err: unknown) {
  if (err instanceof AppError) return err.message;
  return 'No se pudo completar la acción de llamada';
}

export function registerCallHandlers(socket: KyroSocket) {
  const { userId } = socket.data;

  socket.on('call:start', async (payload, ack) => {
    try {
      const kind = payload?.kind === 'video' ? 'video' : 'audio';
      const call = await startCall(userId, { conversationId: payload.conversationId, kind });
      ack?.({ ok: true, call, iceServers: env.iceServers });
    } catch (err) {
      if (!(err instanceof AppError)) logger.error({ err }, 'Error al iniciar llamada');
      ack?.({ ok: false, error: reason(err) });
    }
  });

  socket.on('call:accept', async ({ callId }) => {
    try {
      await acceptCall(userId, callId);
    } catch (err) {
      socket.emit('error', { code: 'call_accept_failed', message: reason(err) });
    }
  });

  socket.on('call:decline', async ({ callId }) => {
    try {
      await declineCall(userId, callId);
    } catch (err) {
      socket.emit('error', { code: 'call_decline_failed', message: reason(err) });
    }
  });

  socket.on('call:hangup', async ({ callId }) => {
    try {
      await hangupCall(userId, callId);
    } catch (err) {
      socket.emit('error', { code: 'call_hangup_failed', message: reason(err) });
    }
  });

  socket.on('disconnect', () => {
    // Solo si al usuario no le queda ninguna otra pestaña abierta.
    void (async () => {
      const sockets = await socket.nsp.in(`user:${userId}`).fetchSockets();
      if (sockets.length > 0) return;
      await releaseUserCalls(userId);
    })().catch((err) => logger.error({ err }, 'Error al liberar llamadas al desconectar'));
  });
}
