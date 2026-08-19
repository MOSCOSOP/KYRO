import { memo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCheck,
  Copy,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Reply,
  Trash2,
} from 'lucide-react';
import type { Conversation, Message } from '@kyro/shared';
import { ROLE_RANK } from '@kyro/shared';
import { parseMessageParts } from '@/lib/conversation';
import { timeOf } from '@/lib/format';
import { useChat } from '@/store/chat';
import { toastError, toastOk, useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Menu, MenuItem, MenuSeparator, useMenu } from '@/components/ui/Menu';
import { Textarea } from '@/components/ui/Field';
import { Attachments } from './Attachments';
import styles from './MessageItem.module.css';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀'];

interface MessageItemProps {
  message: Message;
  conversation: Conversation;
  selfId: string;
  grouped: boolean;
  highlighted?: boolean;
  onJumpTo?: (messageId: string) => void;
}

export const MessageItem = memo(function MessageItem({
  message,
  conversation,
  selfId,
  grouped,
  highlighted,
  onJumpTo,
}: MessageItemProps) {
  const menu = useMenu();
  const moreRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(message.content);
  const editingId = useChat((state) => state.editing[conversation.id]);
  const chat = useChat.getState();
  const confirm = useUI((state) => state.confirm);
  const openProfile = useUI((state) => state.openProfile);

  const editing = editingId === message.id;
  const mine = message.author?.id === selfId;
  const canModerate = ROLE_RANK[conversation.myRole] >= ROLE_RANK.moderator;
  // En privados y grupos cualquiera puede fijar; en canales, el equipo.
  const canPin = conversation.type !== 'channel' || canModerate;
  const mentionsMe = message.mentions.includes(selfId);

  if (message.type === 'system' || message.type === 'call') {
    return (
      <div className={styles.system}>
        <span className={styles.systemText}>
          {message.type === 'call' ? <Phone size={12} /> : null}
          {message.content}
        </span>
      </div>
    );
  }

  const react = async (emoji: string) => {
    try {
      await chat.toggleReaction(message.id, conversation.id, emoji);
    } catch (err) {
      toastError(err, 'No se pudo reaccionar');
    }
  };

  const saveEdit = async () => {
    const content = draft.trim();
    if (!content || content === message.content) {
      chat.setEditing(conversation.id, null);
      return;
    }
    try {
      await chat.editMessage(message.id, conversation.id, content);
    } catch (err) {
      toastError(err, 'No se pudo editar el mensaje');
    }
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      chat.setEditing(conversation.id, null);
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void saveEdit();
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: '¿Eliminar el mensaje?',
      description: 'Se eliminará para todos los participantes.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await chat.deleteMessage(message.id, conversation.id);
    } catch (err) {
      toastError(err, 'No se pudo eliminar');
    }
  };

  return (
    <article
      className={clsx(
        styles.row,
        !grouped && styles.rowFirst,
        highlighted && styles.highlight,
        mentionsMe && !mine && styles.mentioned,
      )}
      onContextMenu={menu.openAt}
      id={`msg-${message.id}`}
    >
      {grouped ? (
        <span className={styles.stampSlot}>{timeOf(message.createdAt)}</span>
      ) : (
        <span className={styles.avatarSlot}>
          <Avatar user={message.author} size="md" presence />
        </span>
      )}

      <div className={styles.content}>
        {message.replyTo ? (
          <button
            type="button"
            className={styles.replyRef}
            onClick={() => onJumpTo?.(message.replyTo!.id)}
          >
            <Reply size={12} />
            <span className={styles.replyAuthor}>{message.replyTo.authorName}</span>
            <span className={styles.replyText}>
              {message.replyTo.deletedAt
                ? 'Mensaje eliminado'
                : message.replyTo.content || 'Archivo adjunto'}
            </span>
          </button>
        ) : null}

        {!grouped ? (
          <div className={styles.meta}>
            <button
              type="button"
              className={styles.author}
              onClick={() => message.author && openProfile(message.author.username)}
            >
              {message.author?.displayName ?? 'Alguien'}
            </button>
            <span className={styles.time}>{timeOf(message.createdAt)}</span>
            {message.pinnedAt ? (
              <span className={styles.badge}>
                <Pin size={9} /> Fijado
              </span>
            ) : null}
          </div>
        ) : null}

        {message.deletedAt ? (
          <p className={clsx(styles.text, styles.deleted)}>Este mensaje fue eliminado</p>
        ) : editing ? (
          <div className={styles.editor}>
            <Textarea
              value={draft}
              autoFocus
              rows={2}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onEditorKeyDown}
            />
            <span className={styles.editorHint}>
              Enter para guardar · Esc para cancelar
            </span>
          </div>
        ) : (
          <>
            {message.content ? (
              <p className={styles.text}>
                <MessageText content={message.content} selfId={selfId} conversation={conversation} />
                {message.editedAt ? <span className={styles.edited}>(editado)</span> : null}
                {mine && conversation.type === 'direct' ? (
                  <span
                    className={clsx(
                      styles.receipts,
                      message.readBy.some((id) => id !== selfId) && styles.receiptsRead,
                    )}
                  >
                    {message.readBy.some((id) => id !== selfId) ? (
                      <CheckCheck size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                  </span>
                ) : null}
              </p>
            ) : null}
            <Attachments items={message.attachments} />
          </>
        )}

        {message.reactions.length > 0 ? (
          <div className={styles.reactions}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className={clsx(styles.reaction, reaction.reacted && styles.reacted)}
                onClick={() => void react(reaction.emoji)}
                title={`${reaction.count} ${reaction.count === 1 ? 'persona' : 'personas'}`}
              >
                <span aria-hidden>{reaction.emoji}</span>
                {reaction.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!message.deletedAt && !editing ? (
        <div className={styles.hoverActions}>
          {QUICK_EMOJIS.slice(0, 3).map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.quickEmoji}
              onClick={() => void react(emoji)}
              aria-label={`Reaccionar con ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <IconButton
            label="Responder"
            size="sm"
            onClick={() => chat.setReplyTo(conversation.id, message)}
          >
            <Reply size={15} />
          </IconButton>
          <IconButton
            ref={moreRef}
            label="Más acciones"
            size="sm"
            onClick={() => menu.openFrom(moreRef.current)}
          >
            <MoreHorizontal size={15} />
          </IconButton>
        </div>
      ) : null}

      {menu.anchor ? (
        <Menu anchor={menu.anchor} onClose={menu.close} label="Acciones del mensaje">
          <div style={{ display: 'flex', padding: 4, gap: 2 }}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.quickEmoji}
                onClick={() => {
                  void react(emoji);
                  menu.close();
                }}
                aria-label={`Reaccionar con ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <MenuSeparator />
          <MenuItem
            icon={<Reply size={16} />}
            onSelect={() => {
              chat.setReplyTo(conversation.id, message);
              menu.close();
            }}
          >
            Responder
          </MenuItem>
          <MenuItem
            icon={<Copy size={16} />}
            onSelect={() => {
              void navigator.clipboard
                .writeText(message.content)
                .then(() => toastOk('Texto copiado'))
                .catch(() => toastError(new Error('No se pudo copiar')));
              menu.close();
            }}
          >
            Copiar texto
          </MenuItem>
          <MenuItem
            icon={message.saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            onSelect={() => {
              void chat.toggleSave(message.id, conversation.id).catch((err) => toastError(err));
              menu.close();
            }}
          >
            {message.saved ? 'Quitar de guardados' : 'Guardar mensaje'}
          </MenuItem>
          {canPin ? (
            <MenuItem
              icon={message.pinnedAt ? <PinOff size={16} /> : <Pin size={16} />}
              onSelect={() => {
                void chat
                  .togglePin(message.id, conversation.id, !message.pinnedAt)
                  .catch((err) => toastError(err, 'No se pudo fijar'));
                menu.close();
              }}
            >
              {message.pinnedAt ? 'No fijar' : 'Fijar en la conversación'}
            </MenuItem>
          ) : null}
          {mine ? (
            <MenuItem
              icon={<Pencil size={16} />}
              onSelect={() => {
                setDraft(message.content);
                chat.setEditing(conversation.id, message.id);
                menu.close();
              }}
            >
              Editar
            </MenuItem>
          ) : null}
          {mine || canModerate ? (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<Trash2 size={16} />}
                danger
                onSelect={() => {
                  void remove();
                  menu.close();
                }}
              >
                Eliminar
              </MenuItem>
            </>
          ) : null}
        </Menu>
      ) : null}
    </article>
  );
});

function MessageText({
  content,
  selfId,
  conversation,
}: {
  content: string;
  selfId: string;
  conversation: Conversation;
}) {
  const parts = parseMessageParts(content);
  const selfUsername = conversation.members.find((member) => member.id === selfId)?.username;

  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'link') {
          return (
            <a key={index} href={part.value} target="_blank" rel="noreferrer noopener nofollow">
              {part.value}
            </a>
          );
        }
        if (part.kind === 'mention') {
          const handle = part.value.slice(1).toLowerCase();
          const isSelf = handle === selfUsername || handle === 'everyone';
          return (
            <span key={index} className={clsx(styles.mention, isSelf && styles.mentionSelf)}>
              {part.value}
            </span>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </>
  );
}
