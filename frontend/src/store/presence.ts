import { create } from 'zustand';
import type { CustomStatus, PresenceStatus, PublicUser, UserActivity } from '@kyro/shared';

export interface PresenceEntry {
  status: PresenceStatus;
  customStatus: CustomStatus | null;
  activity: UserActivity | null;
  lastSeenAt: string | null;
}

interface PresenceState {
  byUser: Record<string, PresenceEntry>;
  apply: (userId: string, entry: PresenceEntry) => void;
  /** Siembra el mapa con lo que ya venía en las respuestas del API. */
  seed: (users: PublicUser[]) => void;
  get: (user: PublicUser) => PresenceEntry;
  reset: () => void;
}

export const usePresence = create<PresenceState>((set, get) => ({
  byUser: {},

  apply(userId, entry) {
    set({ byUser: { ...get().byUser, [userId]: entry } });
  },

  seed(users) {
    const byUser = { ...get().byUser };
    let changed = false;
    for (const user of users) {
      if (byUser[user.id]) continue;
      byUser[user.id] = {
        status: user.status,
        customStatus: user.customStatus,
        activity: user.activity,
        lastSeenAt: user.lastSeenAt,
      };
      changed = true;
    }
    if (changed) set({ byUser });
  },

  get(user) {
    return (
      get().byUser[user.id] ?? {
        status: user.status,
        customStatus: user.customStatus,
        activity: user.activity,
        lastSeenAt: user.lastSeenAt,
      }
    );
  },

  reset() {
    set({ byUser: {} });
  },
}));

/** Hook cómodo: presencia viva de un usuario, con su valor del API de reserva. */
export function usePresenceOf(user: PublicUser | null | undefined): PresenceEntry | null {
  const entry = usePresence((state) => (user ? state.byUser[user.id] : undefined));
  if (!user) return null;
  return (
    entry ?? {
      status: user.status,
      customStatus: user.customStatus,
      activity: user.activity,
      lastSeenAt: user.lastSeenAt,
    }
  );
}
