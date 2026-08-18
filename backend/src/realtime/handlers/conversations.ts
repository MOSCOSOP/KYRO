import { prisma } from '../../lib/prisma.js';
import { publicUserSelect, serializeUserAsync } from '../../serializers/user.js';
import { conversationRoom, type KyroSocket } from '../io.js';
import { emitToConversationMembers, emitToConversationRoom } from '../broadcast.js';

async function isMember(conversationId: string, userId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return Boolean(member);
}

export function registerConversationHandlers(socket: KyroSocket) {
  const { userId } = socket.data;

  socket.on('conversation:subscribe', async ({ conversationId }) => {
    if (!conversationId || !(await isMember(conversationId, userId))) return;
    await socket.join(conversationRoom(conversationId));
  });

  socket.on('conversation:unsubscribe', async ({ conversationId }) => {
    await socket.leave(conversationRoom(conversationId));
  });

  socket.on('conversation:typing', async ({ conversationId, typing }) => {
    if (!conversationId || !(await isMember(conversationId, userId))) return;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!user) return;
    emitToConversationRoom(
      conversationId,
      'conversation:typing',
      { conversationId, user: await serializeUserAsync(user), typing: Boolean(typing) },
      { exclude: [userId] },
    );
  });

  socket.on('conversation:read', async ({ conversationId, lastReadAt }) => {
    if (!conversationId || !(await isMember(conversationId, userId))) return;
    const readAt = lastReadAt ? new Date(lastReadAt) : new Date();
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: readAt },
    });
    emitToConversationMembers(conversationId, 'conversation:read', {
      conversationId,
      userId,
      lastReadAt: readAt.toISOString(),
    });
  });
}
