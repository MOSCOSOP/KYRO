import type { CurrentUser, CustomStatus, PresenceStatus, PublicUser, UserActivity, UserPreferences } from '@kyro/shared';
import type { User } from '@prisma/client';
import { effectiveStatuses } from '../realtime/presence.js';

export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  accentColor: true,
  status: true,
  customStatusJson: true,
  activityJson: true,
  lastSeenAt: true,
  createdAt: true,
} as const;

export type UserRow = Pick<User, keyof typeof publicUserSelect & keyof User>;

export const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: { messages: true, mentions: true, communities: true, calls: true, sounds: true },
  reducedMotion: false,
  enterToSend: true,
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseCustomStatus(raw: string | null): CustomStatus | null {
  const value = parseJson<CustomStatus | null>(raw, null);
  if (!value) return null;
  if (value.expiresAt && new Date(value.expiresAt) < new Date()) return null;
  return value;
}

export function parseActivity(raw: string | null): UserActivity | null {
  return parseJson<UserActivity | null>(raw, null);
}

export function parsePreferences(raw: string | null): UserPreferences {
  const stored = parseJson<Partial<UserPreferences>>(raw, {});
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(stored.notifications ?? {}) },
  };
}

export function serializeUser(user: UserRow, status: PresenceStatus): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    accentColor: user.accentColor,
    status,
    customStatus: parseCustomStatus(user.customStatusJson),
    activity: parseActivity(user.activityJson),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Resuelve la presencia real (conexión + preferencia) de un grupo de usuarios. */
export async function serializeUsers(users: UserRow[]): Promise<PublicUser[]> {
  const statuses = await effectiveStatuses(users);
  return users.map((user) => serializeUser(user, statuses.get(user.id) ?? 'offline'));
}

export async function serializeUserAsync(user: UserRow): Promise<PublicUser> {
  const [serialized] = await serializeUsers([user]);
  return serialized;
}

export function serializeCurrentUser(user: User): CurrentUser {
  return {
    ...serializeUser(user, user.status as PresenceStatus),
    email: user.email,
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    preferences: parsePreferences(user.preferencesJson),
  };
}
