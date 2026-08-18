import { create } from 'zustand';
import type { AppNotification } from '@kyro/shared';
import { api } from '@/lib/api';

interface NotificationsState {
  items: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;

  load: (options?: { reset?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  refreshCount: () => Promise<void>;
  markRead: (ids?: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  applyIncoming: (notification: AppNotification, unreadCount: number) => void;
  reset: () => void;
}

interface Page {
  items: AppNotification[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  unreadCount: 0,
  nextCursor: null,
  hasMore: false,
  loading: false,
  loaded: false,

  async load(options) {
    if (get().loading) return;
    set({ loading: true });
    try {
      const page = await api.get<Page>('/notifications');
      set({
        items: page.items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        unreadCount: page.unreadCount,
        loading: false,
        loaded: true,
      });
    } catch (err) {
      set({ loading: false });
      if (!options?.reset) throw err;
    }
  },

  async loadMore() {
    const { hasMore, nextCursor, loading } = get();
    if (!hasMore || !nextCursor || loading) return;
    set({ loading: true });
    try {
      const page = await api.get<Page>('/notifications', { query: { cursor: nextCursor } });
      set({
        items: [...get().items, ...page.items],
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        loading: false,
      });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  async refreshCount() {
    const data = await api.get<{ count: number }>('/notifications/unread-count');
    set({ unreadCount: data.count });
  },

  async markRead(ids) {
    const now = new Date().toISOString();
    set({
      items: get().items.map((item) =>
        !ids || ids.includes(item.id) ? { ...item, readAt: item.readAt ?? now } : item,
      ),
    });
    const data = await api.post<{ unreadCount: number }>('/notifications/read', { ids });
    set({ unreadCount: data.unreadCount });
  },

  async remove(id) {
    set({ items: get().items.filter((item) => item.id !== id) });
    await api.delete(`/notifications/${id}`);
    await get().refreshCount();
  },

  applyIncoming(notification, unreadCount) {
    set({ items: [notification, ...get().items], unreadCount });
  },

  reset() {
    set({ items: [], unreadCount: 0, nextCursor: null, hasMore: false, loaded: false });
  },
}));
