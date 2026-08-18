import type { MemberRole } from './types.js';

/** Jerarquía de roles: un rol puede actuar sobre roles estrictamente inferiores. */
export const ROLE_RANK: Record<MemberRole, number> = {
  owner: 3,
  admin: 2,
  moderator: 1,
  member: 0,
};

export type Permission =
  | 'message.send'
  | 'message.pin'
  | 'message.delete.any'
  | 'channel.create'
  | 'channel.edit'
  | 'channel.delete'
  | 'room.create'
  | 'room.manage'
  | 'event.create'
  | 'member.invite'
  | 'member.kick'
  | 'member.role'
  | 'community.edit'
  | 'community.delete';

const MIN_ROLE: Record<Permission, MemberRole> = {
  'message.send': 'member',
  'message.pin': 'moderator',
  'message.delete.any': 'moderator',
  'channel.create': 'admin',
  'channel.edit': 'admin',
  'channel.delete': 'admin',
  'room.create': 'admin',
  'room.manage': 'moderator',
  'event.create': 'moderator',
  'member.invite': 'member',
  'member.kick': 'moderator',
  'member.role': 'admin',
  'community.edit': 'admin',
  'community.delete': 'owner',
};

export function can(role: MemberRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[permission]];
}

export function outranks(a: MemberRole | null, b: MemberRole | null): boolean {
  if (!a || !b) return false;
  return ROLE_RANK[a] > ROLE_RANK[b];
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  moderator: 'Moderador',
  member: 'Miembro',
};
