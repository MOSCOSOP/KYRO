import type { Call, CallKind, CallStatus } from '@kyro/shared';
import type { Prisma } from '@prisma/client';
import { publicUserSelect, serializeUsers } from './user.js';

export const callInclude = {
  initiator: { select: publicUserSelect },
  participants: { include: { user: { select: publicUserSelect } } },
} satisfies Prisma.CallInclude;

export type CallRow = Prisma.CallGetPayload<{ include: typeof callInclude }>;

export async function serializeCall(row: CallRow): Promise<Call> {
  const users = await serializeUsers([
    ...(row.initiator ? [row.initiator] : []),
    ...row.participants.map((participant) => participant.user),
  ]);
  const byId = new Map(users.map((user) => [user.id, user]));

  return {
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind as CallKind,
    status: row.status as CallStatus,
    initiator: byId.get(row.initiatorId ?? '') ?? users[0],
    participants: row.participants
      .map((participant) => byId.get(participant.userId))
      .filter((user): user is NonNullable<typeof user> => Boolean(user)),
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationMs: row.endedAt ? row.endedAt.getTime() - row.startedAt.getTime() : null,
  };
}
