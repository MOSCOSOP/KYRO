import { create } from 'zustand';
import type { Conversation, Message, Paginated, PublicUser, Reaction } from '@kyro/shared';
import { TYPING_TIMEOUT_MS } from '@kyro/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useSession } from './session';

/**
 * Conversaciones y mensajes.
 *
 * Un único store porque en KYRO son la misma cosa: chats privados, grupos y
 * canales de comunidad comparten modelo, así que también comparten estado.
 * Los componentes solo leen y llaman acciones; aquí vive toda la lógica.
 */

/**
 * Un mensaje dentro del hilo. Es el del servidor más lo que solo existe en
 * este navegador: si aún está saliendo, si falló y con qué datos reintentarlo.
 */
export interface ThreadMessage extends Message {
  localId?: string;
  pending?: boolean;
  failed?: boolean;
  draft?: {
    content: string;
    replyToId: string | null;
    attachmentTokens: string[];
  };
}

export interface Thread {
  messages: ThreadMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
}

interface TypingEntry {
  user: PublicUser;
  until: number;
}

const emptyThread: Thread = {
  messages: [],
  nextCursor: null,
  hasMore: false,
  loading: false,
  loaded: false,
};

interface ChatState {
  conversations: Conversation[];
  conversationsLoaded: boolean;
  conversationsLoading: boolean;
  threads: Record<string, Thread>;
  typing: Record<string, TypingEntry[]>;
  drafts: Record<string, string>;
  replyTo: Record<string, Message | null>;
  editing: Record<string, string | null>;
  activeId: string | null;
  sending: Record<string, boolean>;

  loadConversations: () => Promise<void>;
  ensureConversation: (id: string) => Promise<Conversation | null>;
  setActive: (id: string | null) => void;
  getThread: (id: string) => Thread;

  loadMessages: (id: string) => Promise<void>;
  loadOlder: (id: string) => Promise<void>;
  sendMessage: (
    id: string,
    input: { content: string; attachmentTokens?: string[]; attachments?: Message['attachments'] },
  ) => Promise<Message>;
  retryMessage: (conversationId: string, localId: string) => Promise<void>;
  discardMessage: (conversationId: string, localId: string) => void;
  editMessage: (messageId: string, conversationId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string, conversationId: string) => Promise<void>;
  toggleReaction: (messageId: string, conversationId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string, conversationId: string, pinned: boolean) => Promise<void>;
  toggleSave: (messageId: string, conversationId: string) => Promise<void>;
  markRead: (id: string) => void;

  /**
   * Selección múltiple. Vive en el store porque la barra de acciones, la lista
   * y cada mensaje necesitan verla, y porque debe sobrevivir a que un mensaje
   * nuevo vuelva a pintar el hilo.
   */
  selection: string[];
  selecting: boolean;
  startSelection: (messageId: string) => void;
  toggleSelected: (messageId: string) => void;
  clearSelection: () => void;

  setDraft: (id: string, value: string) => void;
  setReplyTo: (id: string, message: Message | null) => void;
  setEditing: (id: string, messageId: string | null) => void;
  sendTyping: (id: string, typing: boolean) => void;

  /* ------------------------- Entradas de tiempo real ---------------------- */
  applyIncoming: (message: Message, conversation: Conversation, viewerId: string) => void;
  applyUpdated: (message: Message) => void;
  applyDeleted: (conversationId: string, messageId: string, deletedAt: string) => void;
  applyReactions: (conversationId: string, messageId: string, reactions: Reaction[]) => void;
  applyPinned: (conversationId: string, messageId: string, pinnedAt: string | null) => void;
  applyConversation: (conversation: Conversation) => void;
  applyConversationShared: (conversation: Conversation) => void;
  removeConversation: (conversationId: string) => void;
  applyTyping: (conversationId: string, user: PublicUser, typing: boolean) => void;
  applyRead: (conversationId: string, userId: string, lastReadAt: string) => void;
  reset: () => void;
}

/** Pinnadas primero; después, la más reciente arriba. */
function sortConversations(items: Conversation[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aAt = a.lastMessageAt ?? a.createdAt;
    const bAt = b.lastMessageAt ?? b.createdAt;
    return bAt < aAt ? -1 : bAt > aAt ? 1 : 0;
  });
}

let typingSentAt = 0;

export const useChat = create<ChatState>((set, get) => ({
  conversations: [],
  conversationsLoaded: false,
  conversationsLoading: false,
  threads: {},
  typing: {},
  drafts: {},
  replyTo: {},
  editing: {},
  activeId: null,
  sending: {},

  async loadConversations() {
    if (get().conversationsLoading) return;
    set({ conversationsLoading: true });
    try {
      const data = await api.get<{ items: Conversation[] }>('/conversations');
      set({
        conversations: sortConversations(data.items),
        conversationsLoaded: true,
        conversationsLoading: false,
      });
    } catch (err) {
      set({ conversationsLoading: false });
      throw err;
    }
  },

  async ensureConversation(id) {
    const existing = get().conversations.find((conversation) => conversation.id === id);
    if (existing) return existing;
    try {
      const conversation = await api.get<Conversation>(`/conversations/${id}`);
      get().applyConversation(conversation);
      return conversation;
    } catch {
      return null;
    }
  },

  setActive(id) {
    set({ activeId: id });
    if (id) {
      const socket = getSocket();
      socket?.emit('conversation:subscribe', { conversationId: id });
    }
  },

  getThread(id) {
    return get().threads[id] ?? emptyThread;
  },

  async loadMessages(id) {
    const thread = get().threads[id];
    if (thread?.loading || thread?.loaded) return;

    set({ threads: { ...get().threads, [id]: { ...emptyThread, ...thread, loading: true } } });
    try {
      const page = await api.get<Paginated<Message>>(`/conversations/${id}/messages`);
      set({
        threads: {
          ...get().threads,
          [id]: {
            messages: page.items,
            nextCursor: page.nextCursor,
            hasMore: page.hasMore,
            loading: false,
            loaded: true,
          },
        },
      });
    } catch (err) {
      set({
        threads: { ...get().threads, [id]: { ...emptyThread, ...thread, loading: false } },
      });
      throw err;
    }
  },

  async loadOlder(id) {
    const thread = get().threads[id];
    if (!thread || thread.loading || !thread.hasMore || !thread.nextCursor) return;

    set({ threads: { ...get().threads, [id]: { ...thread, loading: true } } });
    const page = await api.get<Paginated<Message>>(`/conversations/${id}/messages`, {
      query: { cursor: thread.nextCursor },
    });
    const current = get().threads[id] ?? thread;
    const known = new Set(current.messages.map((message) => message.id));
    set({
      threads: {
        ...get().threads,
        [id]: {
          ...current,
          messages: [...page.items.filter((message) => !known.has(message.id)), ...current.messages],
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          loading: false,
        },
      },
    });
  },

  /**
   * Envío optimista.
   *
   * El mensaje aparece en el hilo al instante, marcado como «enviando», y solo
   * después viaja al servidor. Si falla —sin conexión, servidor caído— no se
   * pierde: se queda visible como «no enviado» y se puede reintentar. Escribir
   * y que el texto desaparezca en el aire es lo peor que puede hacer un chat.
   */
  async sendMessage(id, input) {
    const author = useSession.getState().user;
    const replyTo = get().replyTo[id] ?? null;
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const optimistic: ThreadMessage = {
      id: localId,
      localId,
      pending: true,
      conversationId: id,
      author: author ?? null,
      content: input.content,
      type: 'text',
      meta: null,
      attachments: input.attachments ?? [],
      reactions: [],
      replyTo: replyTo
        ? {
            id: replyTo.id,
            content: replyTo.content,
            authorId: replyTo.author?.id ?? '',
            authorName: replyTo.author?.displayName ?? '',
            deletedAt: null,
            attachmentCount: replyTo.attachments.length,
          }
        : null,
      mentions: [],
      editedAt: null,
      deletedAt: null,
      pinnedAt: null,
      saved: false,
      createdAt: new Date().toISOString(),
      readBy: [],
      draft: {
        content: input.content,
        replyToId: replyTo?.id ?? null,
        attachmentTokens: input.attachmentTokens ?? [],
      },
    };

    appendMessage(set, get, optimistic);
    set({
      sending: { ...get().sending, [id]: true },
      drafts: { ...get().drafts, [id]: '' },
      replyTo: { ...get().replyTo, [id]: null },
    });

    try {
      const message = await api.post<Message>(`/conversations/${id}/messages`, {
        content: input.content,
        replyToId: replyTo?.id ?? null,
        attachmentTokens: input.attachmentTokens ?? [],
      });
      // El servidor manda: su versión sustituye a la provisional.
      swapMessage(set, get, id, localId, message);
      return message;
    } catch (err) {
      markFailed(set, get, id, localId);
      throw err;
    } finally {
      set({ sending: { ...get().sending, [id]: false } });
      get().sendTyping(id, false);
    }
  },

  /** Reintenta un mensaje que no llegó a salir. */
  async retryMessage(conversationId, localId) {
    const thread = get().threads[conversationId];
    const failed = thread?.messages.find((message) => message.id === localId);
    if (!failed?.draft) return;

    updateMessage(set, get, conversationId, localId, { pending: true, failed: false });

    try {
      const message = await api.post<Message>(`/conversations/${conversationId}/messages`, {
        content: failed.draft.content,
        replyToId: failed.draft.replyToId,
        attachmentTokens: failed.draft.attachmentTokens,
      });
      swapMessage(set, get, conversationId, localId, message);
    } catch (err) {
      markFailed(set, get, conversationId, localId);
      throw err;
    }
  },

  /** Descarta un mensaje que nunca llegó a enviarse. */
  discardMessage(conversationId, localId) {
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({
      threads: {
        ...get().threads,
        [conversationId]: {
          ...thread,
          messages: thread.messages.filter((message) => message.id !== localId),
        },
      },
    });
  },

  async editMessage(messageId, conversationId, content) {
    const message = await api.patch<Message>(`/messages/${messageId}`, { content });
    replaceMessage(set, get, conversationId, message);
    set({ editing: { ...get().editing, [conversationId]: null } });
  },

  async deleteMessage(messageId, conversationId) {
    await api.delete(`/messages/${messageId}`);
    // El evento de tiempo real cierra el círculo; se refleja ya mismo.
    get().applyDeleted(conversationId, messageId, new Date().toISOString());
  },

  async toggleReaction(messageId, conversationId, emoji) {
    const data = await api.post<{ reactions: Reaction[] }>(`/messages/${messageId}/reactions`, {
      emoji,
    });
    get().applyReactions(conversationId, messageId, data.reactions);
  },

  async togglePin(messageId, conversationId, pinned) {
    const data = await api.post<{ pinnedAt: string | null }>(`/messages/${messageId}/pin`, {
      pinned,
    });
    get().applyPinned(conversationId, messageId, data.pinnedAt);
  },

  async toggleSave(messageId, conversationId) {
    const data = await api.post<{ saved: boolean }>(`/messages/${messageId}/save`);
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({
      threads: {
        ...get().threads,
        [conversationId]: {
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === messageId ? { ...message, saved: data.saved } : message,
          ),
        },
      },
    });
  },

  markRead(id) {
    const conversation = get().conversations.find((item) => item.id === id);
    if (!conversation || conversation.unreadCount === 0) return;

    set({
      conversations: get().conversations.map((item) =>
        item.id === id ? { ...item, unreadCount: 0 } : item,
      ),
    });
    const socket = getSocket();
    if (socket?.connected) socket.emit('conversation:read', { conversationId: id });
    else void api.post(`/conversations/${id}/read`).catch(() => undefined);
  },

  selection: [],
  selecting: false,

  startSelection(messageId) {
    set({ selecting: true, selection: [messageId] });
  },

  toggleSelected(messageId) {
    const current = get().selection;
    const next = current.includes(messageId)
      ? current.filter((id) => id !== messageId)
      : [...current, messageId];
    // Al deseleccionar el último se sale del modo: no hay que pulsar «cancelar».
    set({ selection: next, selecting: next.length > 0 });
  },

  clearSelection() {
    set({ selection: [], selecting: false });
  },

  setDraft(id, value) {
    set({ drafts: { ...get().drafts, [id]: value } });
  },

  setReplyTo(id, message) {
    set({ replyTo: { ...get().replyTo, [id]: message } });
  },

  setEditing(id, messageId) {
    set({ editing: { ...get().editing, [id]: messageId } });
  },

  sendTyping(id, typing) {
    const socket = getSocket();
    if (!socket?.connected) return;
    const now = Date.now();
    // No hace falta avisar en cada tecla.
    if (typing && now - typingSentAt < 2500) return;
    typingSentAt = typing ? now : 0;
    socket.emit('conversation:typing', { conversationId: id, typing });
  },

  /* --------------------------- Tiempo real -------------------------------- */

  applyIncoming(message, conversation, viewerId) {
    appendMessage(set, get, message);

    const state = get();
    const isActive = state.activeId === message.conversationId;
    const known = state.conversations.find((item) => item.id === message.conversationId);
    const mine = message.author?.id === viewerId;

    // El evento viaja serializado desde la perspectiva de quien escribe: solo
    // se toman de él los datos que no dependen de quién mira.
    if (!known) {
      void get().ensureConversation(message.conversationId);
    } else {
      const merged: Conversation = {
        ...known,
        lastMessageAt: conversation.lastMessageAt ?? known.lastMessageAt,
        lastMessage: conversation.lastMessage ?? known.lastMessage,
        memberCount: conversation.memberCount,
        topic: conversation.topic,
        unreadCount: isActive || mine ? 0 : known.unreadCount + 1,
      };

      set({
        conversations: sortConversations([
          merged,
          ...state.conversations.filter((item) => item.id !== merged.id),
        ]),
      });
    }

    if (isActive && !mine) get().markRead(message.conversationId);
  },

  applyUpdated(message) {
    replaceMessage(set, get, message.conversationId, message);
  },

  applyDeleted(conversationId, messageId, deletedAt) {
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({
      threads: {
        ...get().threads,
        [conversationId]: {
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === messageId
              ? { ...message, deletedAt, content: '', attachments: [], reactions: [] }
              : message,
          ),
        },
      },
    });
  },

  applyReactions(conversationId, messageId, reactions) {
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({
      threads: {
        ...get().threads,
        [conversationId]: {
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === messageId ? { ...message, reactions } : message,
          ),
        },
      },
    });
  },

  applyPinned(conversationId, messageId, pinnedAt) {
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({
      threads: {
        ...get().threads,
        [conversationId]: {
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === messageId ? { ...message, pinnedAt } : message,
          ),
        },
      },
    });
  },

  applyConversation(conversation) {
    const existing = get().conversations.find((item) => item.id === conversation.id);
    const next = existing
      ? get().conversations.map((item) => (item.id === conversation.id ? conversation : item))
      : [...get().conversations, conversation];
    set({ conversations: sortConversations(next) });
  },

  /**
   * Actualización difundida a toda la conversación: llega serializada desde la
   * perspectiva de quien la provocó, así que solo se toman los campos comunes
   * y se conserva lo que depende de cada persona (rol, silencio, no leídos).
   */
  applyConversationShared(conversation) {
    const known = get().conversations.find((item) => item.id === conversation.id);
    if (!known) {
      void get().ensureConversation(conversation.id);
      return;
    }

    const shared: Conversation =
      conversation.type === 'direct'
        ? {
            ...known,
            topic: conversation.topic,
            memberCount: conversation.memberCount,
            lastMessageAt: conversation.lastMessageAt ?? known.lastMessageAt,
            lastMessage: conversation.lastMessage ?? known.lastMessage,
          }
        : {
            ...known,
            name: conversation.name,
            topic: conversation.topic,
            avatarUrl: conversation.avatarUrl,
            members: conversation.members,
            memberCount: conversation.memberCount,
            lastMessageAt: conversation.lastMessageAt ?? known.lastMessageAt,
            lastMessage: conversation.lastMessage ?? known.lastMessage,
          };

    set({
      conversations: sortConversations(
        get().conversations.map((item) => (item.id === shared.id ? shared : item)),
      ),
    });
  },

  removeConversation(conversationId) {
    const { [conversationId]: _removed, ...threads } = get().threads;
    set({
      conversations: get().conversations.filter((item) => item.id !== conversationId),
      threads,
      activeId: get().activeId === conversationId ? null : get().activeId,
    });
  },

  applyTyping(conversationId, user, typing) {
    const current = get().typing[conversationId] ?? [];
    const others = current.filter((entry) => entry.user.id !== user.id);
    const next = typing ? [...others, { user, until: Date.now() + TYPING_TIMEOUT_MS }] : others;
    set({ typing: { ...get().typing, [conversationId]: next } });
  },

  applyRead(conversationId, userId, lastReadAt) {
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({
      threads: {
        ...get().threads,
        [conversationId]: {
          ...thread,
          messages: thread.messages.map((message) => {
            if (message.createdAt > lastReadAt) return message;
            if (message.readBy.includes(userId)) return message;
            return { ...message, readBy: [...message.readBy, userId] };
          }),
        },
      },
    });
  },

  reset() {
    set({
      conversations: [],
      conversationsLoaded: false,
      threads: {},
      typing: {},
      drafts: {},
      replyTo: {},
      editing: {},
      activeId: null,
    });
  },
}));

type Setter = (partial: Partial<ChatState>) => void;
type Getter = () => ChatState;

/** Sustituye el mensaje provisional por el que devolvió el servidor. */
function swapMessage(
  set: Setter,
  get: Getter,
  conversationId: string,
  localId: string,
  message: Message,
) {
  const thread = get().threads[conversationId];
  if (!thread) return;

  // El mismo mensaje puede haber llegado ya por WebSocket: entonces el
  // provisional simplemente desaparece, no se duplica.
  const alreadyArrived = thread.messages.some((item) => item.id === message.id);

  set({
    threads: {
      ...get().threads,
      [conversationId]: {
        ...thread,
        messages: alreadyArrived
          ? thread.messages.filter((item) => item.id !== localId)
          : thread.messages.map((item) => (item.id === localId ? message : item)),
      },
    },
  });
}

function updateMessage(
  set: Setter,
  get: Getter,
  conversationId: string,
  localId: string,
  patch: Partial<ThreadMessage>,
) {
  const thread = get().threads[conversationId];
  if (!thread) return;
  set({
    threads: {
      ...get().threads,
      [conversationId]: {
        ...thread,
        messages: thread.messages.map((item) =>
          item.id === localId ? { ...item, ...patch } : item,
        ),
      },
    },
  });
}

function markFailed(set: Setter, get: Getter, conversationId: string, localId: string) {
  updateMessage(set, get, conversationId, localId, { pending: false, failed: true });
}

function appendMessage(set: Setter, get: Getter, message: ThreadMessage) {
  const thread = get().threads[message.conversationId];
  if (!thread) return; // El hilo se cargará entero cuando se abra.
  if (thread.messages.some((item) => item.id === message.id)) return;

  set({
    threads: {
      ...get().threads,
      [message.conversationId]: { ...thread, messages: [...thread.messages, message] },
    },
  });
}

function replaceMessage(set: Setter, get: Getter, conversationId: string, message: Message) {
  const thread = get().threads[conversationId];
  if (!thread) return;
  set({
    threads: {
      ...get().threads,
      [conversationId]: {
        ...thread,
        messages: thread.messages.map((item) => (item.id === message.id ? message : item)),
      },
    },
  });
}

/** Escritores activos ahora mismo (los avisos caducan solos). */
export function activeTypists(conversationId: string, typing: ChatState['typing']) {
  const now = Date.now();
  return (typing[conversationId] ?? []).filter((entry) => entry.until > now).map((entry) => entry.user);
}
