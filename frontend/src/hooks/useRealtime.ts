import { useEffect } from 'react';
import type { Conversation, Message, UserPreferences } from '@kyro/shared';
import { connectSocket } from '@/lib/socket';
import {
  playMessageTone,
  showSystemNotification,
  startRingtone,
  stopRingtone,
} from '@/lib/alerts';
import { useChat } from '@/store/chat';
import { useCalls } from '@/store/calls';
import { useCommunities } from '@/store/communities';
import { useNotifications } from '@/store/notifications';
import { usePresence } from '@/store/presence';
import { useSession } from '@/store/session';
import { useUI } from '@/store/ui';
import { useVoice } from '@/store/voice';

/**
 * ¿Quiere el usuario que le avisemos de esto?
 *
 * En «No molestar» la respuesta es siempre no: es lo que significa. El resto lo
 * deciden sus preferencias.
 */
function wants(kind: keyof UserPreferences['notifications']) {
  const user = useSession.getState().user;
  if (!user) return false;
  if (user.status === 'dnd') return false;
  if (!user.preferences.notifications.sounds && kind !== 'system') return false;
  return user.preferences.notifications[kind];
}

/**
 * Sonido y aviso del sistema para un mensaje que llega. Nunca por lo que uno
 * mismo escribe, ni en una conversación silenciada, ni en la que se está
 * mirando ahora.
 */
function alertForMessage(message: Message, conversation: Conversation, selfId: string) {
  if (message.author?.id === selfId) return;

  const chat = useChat.getState();
  if (chat.activeId === message.conversationId && !document.hidden) return;

  const known = chat.conversations.find((item) => item.id === message.conversationId);
  if (known?.muted) return;

  const mentionsMe = message.mentions.includes(selfId);
  const kind = mentionsMe ? 'mentions' : conversation.type === 'channel' ? 'communities' : 'messages';
  if (!wants(kind)) return;

  playMessageTone();

  const user = useSession.getState().user;
  if (!user?.preferences.notifications.system) return;

  showSystemNotification({
    title: message.author?.displayName ?? 'Mensaje nuevo',
    body: message.content || 'Te ha enviado un archivo',
    tag: `conversation-${message.conversationId}`,
    onClick: () => {
      window.location.href = `/mensajes/${message.conversationId}`;
    },
  });
}

/**
 * Único punto donde los eventos del servidor entran en la aplicación.
 * Cada evento actualiza su store; los componentes solo leen estado.
 */
export function useRealtime() {
  const userId = useSession((state) => state.user?.id ?? null);

  useEffect(() => {
    if (!userId) return;
    const socket = connectSocket();

    socket.on('message:new', ({ message, conversation }) => {
      useChat.getState().applyIncoming(message, conversation, userId);
      alertForMessage(message, conversation, userId);
    });

    socket.on('message:updated', ({ message }) => {
      useChat.getState().applyUpdated(message);
    });

    socket.on('message:deleted', ({ conversationId, messageId, deletedAt }) => {
      useChat.getState().applyDeleted(conversationId, messageId, deletedAt);
    });

    socket.on('message:reaction', ({ conversationId, messageId, reactions }) => {
      useChat.getState().applyReactions(conversationId, messageId, reactions);
    });

    socket.on('message:pinned', ({ conversationId, messageId, pinnedAt }) => {
      useChat.getState().applyPinned(conversationId, messageId, pinnedAt);
    });

    socket.on('conversation:created', ({ conversation }) => {
      useChat.getState().applyConversation(conversation);
    });

    socket.on('conversation:updated', ({ conversation }) => {
      useChat.getState().applyConversationShared(conversation);
    });

    socket.on('conversation:removed', ({ conversationId }) => {
      useChat.getState().removeConversation(conversationId);
    });

    socket.on('conversation:read', ({ conversationId, userId: readerId, lastReadAt }) => {
      useChat.getState().applyRead(conversationId, readerId, lastReadAt);
    });

    socket.on('conversation:typing', ({ conversationId, user, typing }) => {
      if (user.id === userId) return;
      useChat.getState().applyTyping(conversationId, user, typing);
    });

    socket.on('presence:update', (payload) => {
      usePresence.getState().apply(payload.userId, {
        status: payload.status,
        customStatus: payload.customStatus,
        activity: payload.activity,
        lastSeenAt: payload.lastSeenAt,
      });
    });

    socket.on('notification:new', ({ notification, unreadCount }) => {
      useNotifications.getState().applyIncoming(notification, unreadCount);
    });

    socket.on('room:state', ({ roomId, participants }) => {
      useVoice.getState().applyState(roomId, participants);
    });

    socket.on('room:peer-joined', ({ roomId, participant }) => {
      const state = useVoice.getState();
      if (state.roomId !== roomId) return;
      if (state.participants.some((item) => item.user.id === participant.user.id)) return;
      state.applyState(roomId, [...state.participants, participant]);
    });

    socket.on('room:peer-left', ({ roomId, userId: leavingId }) => {
      const state = useVoice.getState();
      if (state.roomId !== roomId) return;
      state.applyState(
        roomId,
        state.participants.filter((item) => item.user.id !== leavingId),
      );
    });

    socket.on('call:incoming', ({ call }) => {
      useCalls.getState().applyIncoming(call, userId);
      if (call.initiator.id === userId) return;

      if (wants('calls')) startRingtone();
      showSystemNotification({
        title: call.kind === 'video' ? 'Videollamada entrante' : 'Llamada entrante',
        body: call.initiator.displayName,
        tag: `call-${call.id}`,
      });
    });

    socket.on('call:updated', ({ call }) => {
      // Si la llamada ya no está sonando, el timbre sobra.
      stopRingtone();
      useCalls.getState().applyUpdated(call, userId);
    });

    socket.on('call:ended', ({ callId }) => {
      stopRingtone();
      useCalls.getState().applyEnded(callId);
    });

    socket.on('rtc:signal', (payload) => {
      if (payload.scope.kind === 'call') useCalls.getState().handleSignal(payload);
      else useVoice.getState().handleSignal(payload);
    });

    socket.on('error', ({ message }) => {
      useUI.getState().pushToast({ kind: 'error', title: message });
    });

    // Al reconectar, el estado puede haberse quedado atrás.
    const onReconnect = () => {
      void useChat.getState().loadConversations();
      void useNotifications.getState().refreshCount();
      void useCommunities.getState().load();
      const activeId = useChat.getState().activeId;
      if (activeId) socket.emit('conversation:subscribe', { conversationId: activeId });
    };
    socket.io.on('reconnect', onReconnect);

    return () => {
      socket.off('message:new');
      socket.off('message:updated');
      socket.off('message:deleted');
      socket.off('message:reaction');
      socket.off('message:pinned');
      socket.off('conversation:created');
      socket.off('conversation:updated');
      socket.off('conversation:removed');
      socket.off('conversation:read');
      socket.off('conversation:typing');
      socket.off('presence:update');
      socket.off('notification:new');
      socket.off('room:state');
      socket.off('room:peer-joined');
      socket.off('room:peer-left');
      socket.off('call:incoming');
      socket.off('call:updated');
      socket.off('call:ended');
      socket.off('rtc:signal');
      socket.off('error');
      socket.io.off('reconnect', onReconnect);
    };
  }, [userId]);
}
