import { useEffect } from 'react';
import { connectSocket } from '@/lib/socket';
import { useChat } from '@/store/chat';
import { useCalls } from '@/store/calls';
import { useCommunities } from '@/store/communities';
import { useNotifications } from '@/store/notifications';
import { usePresence } from '@/store/presence';
import { useSession } from '@/store/session';
import { useUI } from '@/store/ui';
import { useVoice } from '@/store/voice';

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
    });

    socket.on('call:updated', ({ call }) => {
      useCalls.getState().applyUpdated(call, userId);
    });

    socket.on('call:ended', ({ callId }) => {
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
