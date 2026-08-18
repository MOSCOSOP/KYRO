import type {
  Community,
  CommunityEvent,
  CommunityMember,
  MemberRole,
  RoomKind,
  VoiceRoom,
} from '@kyro/shared';
import type { Prisma } from '@prisma/client';
import { isOnline } from '../realtime/presence.js';
import { participantsByRoom } from '../realtime/rooms.js';
import { publicUserSelect, serializeUser, serializeUsers } from './user.js';

export const communityInclude = {
  _count: { select: { members: true } },
} satisfies Prisma.CommunityInclude;

export type CommunityRow = Prisma.CommunityGetPayload<{ include: typeof communityInclude }>;

interface ViewerContext {
  role: MemberRole | null;
  muted: boolean;
  onlineCount?: number;
}

export function serializeCommunity(row: CommunityRow, viewer: ViewerContext): Community {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    iconUrl: row.iconUrl,
    bannerUrl: row.bannerUrl,
    accentColor: row.accentColor,
    isPublic: row.isPublic,
    memberCount: row._count.members,
    onlineCount: viewer.onlineCount ?? 0,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    myRole: viewer.role,
    muted: viewer.muted,
    // El código de invitación solo se expone a quien puede invitar.
    inviteCode: viewer.role ? row.inviteCode : null,
  };
}

/** Cuenta miembros conectados sin traer a todos: se limita a una muestra. */
export async function countOnlineMembers(memberIds: string[]) {
  const sample = memberIds.slice(0, 200);
  const flags = await Promise.all(sample.map((id) => isOnline(id)));
  return flags.filter(Boolean).length;
}

export async function serializeMembers(
  rows: Prisma.CommunityMemberGetPayload<{ include: { user: { select: typeof publicUserSelect } } }>[],
): Promise<CommunityMember[]> {
  const users = await serializeUsers(rows.map((row) => row.user));
  return rows.map((row, index) => ({
    user: users[index],
    role: row.role as MemberRole,
    nickname: row.nickname,
    joinedAt: row.joinedAt.toISOString(),
  }));
}

export async function serializeRooms(
  rows: { id: string; communityId: string; name: string; kind: string; topic: string | null; maxParticipants: number }[],
): Promise<VoiceRoom[]> {
  const participants = await participantsByRoom(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    communityId: row.communityId,
    name: row.name,
    kind: row.kind as RoomKind,
    topic: row.topic,
    maxParticipants: row.maxParticipants,
    participants: participants.get(row.id) ?? [],
  }));
}

export function serializeEvent(
  row: Prisma.CommunityEventGetPayload<{ include: { _count: { select: { attendees: true } } } }>,
  attending: boolean,
): CommunityEvent {
  return {
    id: row.id,
    communityId: row.communityId,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    roomId: row.roomId,
    channelId: row.channelId,
    createdBy: row.createdById ?? '',
    attendeeCount: row._count.attendees,
    attending,
  };
}

export { serializeUser };
