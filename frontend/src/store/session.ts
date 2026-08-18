import { create } from 'zustand';
import type { AuthResponse, CurrentUser, PresenceStatus, UserPreferences } from '@kyro/shared';
import { api, onSessionExpired, setAccessToken } from '@/lib/api';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface ProfilePatch {
  displayName?: string;
  username?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  accentColor?: string | null;
  status?: Exclude<PresenceStatus, 'offline'>;
  customStatus?: CurrentUser['customStatus'];
  activity?: CurrentUser['activity'];
  preferences?: Partial<UserPreferences>;
  onboarded?: boolean;
}

interface SessionState {
  user: CurrentUser | null;
  status: SessionStatus;
  /** Renovación silenciosa del token de acceso antes de que caduque. */
  refreshTimer: number | null;

  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<CurrentUser>;
  setPresence: (status: Exclude<PresenceStatus, 'offline'>) => Promise<void>;
  applyUser: (user: CurrentUser) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  status: 'loading',
  refreshTimer: null,

  async bootstrap() {
    try {
      // La cookie httpOnly decide si hay sesión: no guardamos nada en el
      // navegador que un script pueda leer.
      const session = await api.post<AuthResponse>('/auth/refresh', undefined, {
        skipRefresh: true,
      });
      startSession(session, set, get);
    } catch {
      set({ user: null, status: 'anonymous' });
    }
  },

  async login(identifier, password) {
    const session = await api.post<AuthResponse>('/auth/login', { identifier, password });
    startSession(session, set, get);
  },

  async register(input) {
    const session = await api.post<AuthResponse>('/auth/register', input);
    startSession(session, set, get);
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      endSession(set, get);
    }
  },

  async updateProfile(patch) {
    const user = await api.patch<CurrentUser>('/users/me', patch);
    set({ user });
    return user;
  },

  async setPresence(status) {
    const current = get().user;
    if (!current) return;
    // Optimista: la presencia debe sentirse instantánea.
    set({ user: { ...current, status } });
    getSocket()?.emit('presence:set', { status });
    try {
      await api.patch<CurrentUser>('/users/me', { status });
    } catch (err) {
      set({ user: current });
      throw err;
    }
  },

  applyUser(user) {
    set({ user });
  },
}));

type Setter = (partial: Partial<SessionState>) => void;
type Getter = () => SessionState;

function startSession(session: AuthResponse, set: Setter, get: Getter) {
  setAccessToken(session.accessToken);
  set({ user: session.user, status: 'authenticated' });
  scheduleRefresh(session.expiresIn, set, get);
  connectSocket();
}

function endSession(set: Setter, get: Getter) {
  const timer = get().refreshTimer;
  if (timer) window.clearTimeout(timer);
  setAccessToken(null);
  disconnectSocket();
  set({ user: null, status: 'anonymous', refreshTimer: null });
}

/** Renueva el token un minuto antes de que expire. */
function scheduleRefresh(expiresIn: number, set: Setter, get: Getter) {
  const previous = get().refreshTimer;
  if (previous) window.clearTimeout(previous);

  const delay = Math.max(30_000, (expiresIn - 60) * 1000);
  const timer = window.setTimeout(async () => {
    try {
      const session = await api.post<AuthResponse>('/auth/refresh', undefined, {
        skipRefresh: true,
      });
      setAccessToken(session.accessToken);
      set({ user: session.user });
      scheduleRefresh(session.expiresIn, set, get);
    } catch {
      endSession(set, get);
    }
  }, delay);

  set({ refreshTimer: timer });
}

// Si el servidor invalida la sesión, la aplicación vuelve al acceso sin
// dejar la interfaz en un estado a medias.
onSessionExpired(() => {
  const { status } = useSession.getState();
  if (status !== 'authenticated') return;
  disconnectSocket();
  useSession.setState({ user: null, status: 'anonymous' });
});
