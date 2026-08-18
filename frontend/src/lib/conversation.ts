import type { Conversation, Message, PublicUser } from '@kyro/shared';

/**
 * En un chat directo, "la conversación" es la otra persona.
 *
 * El servidor ya excluye al propio usuario de `members` en los directos, así
 * que basta con el primero que no seas tú (y, si viniera resuelto desde otra
 * perspectiva, el primero de la lista).
 */
export function otherMember(conversation: Conversation, selfId: string): PublicUser | null {
  if (conversation.type !== 'direct') return null;
  return (
    conversation.members.find((member) => member.id !== selfId) ?? conversation.members[0] ?? null
  );
}

export function conversationName(conversation: Conversation, selfId: string) {
  if (conversation.type === 'direct') {
    return otherMember(conversation, selfId)?.displayName ?? conversation.name ?? 'Conversación';
  }
  return conversation.name ?? 'Conversación';
}

export function conversationAvatar(conversation: Conversation, selfId: string) {
  if (conversation.type === 'direct') {
    return otherMember(conversation, selfId)?.avatarUrl ?? conversation.avatarUrl;
  }
  return conversation.avatarUrl;
}

/** Texto corto del último mensaje para la lista. */
export function previewText(conversation: Conversation, selfId: string) {
  const last = conversation.lastMessage;
  if (!last) return conversation.type === 'channel' ? 'Canal sin mensajes' : 'Sin mensajes todavía';

  const author =
    last.authorId === selfId
      ? 'Tú: '
      : conversation.type === 'direct'
        ? ''
        : last.authorName
          ? `${last.authorName.split(' ')[0]}: `
          : '';

  if (last.deletedAt) return 'Mensaje eliminado';
  if (last.type === 'system' || last.type === 'call') return last.content;
  if (!last.content && last.attachmentCount > 0) {
    return `${author}${last.attachmentCount > 1 ? `${last.attachmentCount} archivos` : 'Archivo adjunto'}`;
  }
  return `${author}${last.content}`;
}

/** Agrupa mensajes consecutivos del mismo autor en una ventana corta. */
export function isGrouped(previous: Message | undefined, current: Message) {
  if (!previous) return false;
  if (previous.type !== 'text' || current.type !== 'text') return false;
  if (!previous.author || !current.author) return false;
  if (previous.author.id !== current.author.id) return false;
  if (current.replyTo) return false;
  const gap = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return gap < 5 * 60_000;
}

export function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Convierte URLs y menciones en partes renderizables (sin usar HTML crudo). */
export type MessagePart =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string }
  | { kind: 'mention'; value: string };

const PATTERN = /(https?:\/\/[^\s<]+)|(@[a-z0-9_.]{3,24})/gi;

export function parseMessageParts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ kind: 'text', value: content.slice(lastIndex, index) });
    if (match[1]) parts.push({ kind: 'link', value: match[1] });
    else if (match[2]) parts.push({ kind: 'mention', value: match[2] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) parts.push({ kind: 'text', value: content.slice(lastIndex) });
  return parts;
}
