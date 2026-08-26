import { memo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Forward,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Reply,
  Trash2,
} from 'lucide-react';
import type { Conversation } from '@kyro/shared';
import { ROLE_RANK } from '@kyro/shared';
import { parseMessageParts } from '@/lib/conversation';
import { firstLink } from '@/lib/linkPreview';
import { timeOf } from '@/lib/format';
import { useChat, type ThreadMessage } from '@/store/chat';
import { toastError, toastOk, useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Menu, MenuItem, MenuSeparator, useMenu } from '@/components/ui/Menu';
import { Textarea } from '@/components/ui/Field';
import { useLongPress } from '@/hooks/useLongPress';
import { useSwipeReply } from '@/hooks/useSwipeReply';
import { Attachments } from './Attachments';
import { LinkPreviewCard } from './LinkPreviewCard';
import styles from './MessageItem.module.css';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀'];

interface MessageItemProps {
  message: ThreadMessage;
  conversation: Conversation;
  selfId: string;
  grouped: boolean;
  highlighted?: boolean;
  onJumpTo?: (messageId: string) => void;
  onForward?: (message: ThreadMessage) => void;
}

export const MessageItem = memo(function MessageItem({
  message,
  conversation,
  selfId,
  grouped,
  highlighted,
  onJumpTo,
  onForward,
}: MessageItemProps) {
  const menu = useMenu();
  const moreRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(message.content);
  const editingId = useChat((state) => state.editing[conversation.id]);
  const chat = useChat.getState();
  const confirm = useUI((state) => state.confirm);
  const openProfile = useUI((state) => state.openProfile);
  const selecting = useChat((state) => state.selecting);
  const selected = useChat((state) => state.selection.includes(message.id));

  // En táctil, mantener pulsado abre el mismo menú que el botón derecho.
  const longPress = useLongPress((point) =>
    menu.openAt({ ...point, preventDefault: () => undefined }),
  );

  const editing = editingId === message.id;
  const mine = message.author?.id === selfId;
  const canModerate = ROLE_RANK[conversation.myRole] >= ROLE_RANK.moderator;
  // En privados y grupos cualquiera puede fijar; en canales, el equipo.
  const canPin = conversation.type !== 'channel' || canModerate;
  const mentionsMe = message.mentions.includes(selfId);
  const link = message.deletedAt ? null : firstLink(message.content);

  // Arrastrar hacia la derecha responde. No mientras se seleccionan mensajes
  // ni sobre uno que todavía no ha salido: no hay nada a lo que responder.
  const swipe = useSwipeReply(() => chat.setReplyTo(conversation.id, message), {
    enabled: !selecting && !message.pending && !message.failed && !message.deletedAt,
    base: longPress,
  });

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
        selecting && styles.selectable,
        selected && styles.selected,
        highlighted && styles.highlight,
        mentionsMe && !mine && styles.mentioned,
        mine && styles.mine,
        message.pending && styles.sending,
      )}
      onContextMenu={message.pending || message.failed ? undefined : menu.openAt}
      {...swipe.handlers}
      onClick={selecting ? () => chat.toggleSelected(message.id) : undefined}
      id={`msg-${message.id}`}
      style={
        swipe.offset > 0
          ? {
              transform: `translateX(${swipe.offset}px)`,
              transition: swipe.dragging ? 'none' : undefined,
            }
          : undefined
      }
    >
      {/* La flecha vive detrás de la fila y se descubre al arrastrarla. */}
      {swipe.offset > 0 ? (
        <span className={clsx(styles.swipeHint, swipe.armed && styles.swipeHintArmed)} aria-hidden>
          <Reply size={16} />
        </span>
      ) : null}
      {grouped ? (
        <span className={styles.stampSlot}>{timeOf(message.createdAt)}</span>
      ) : (
        <span className={styles.avatarSlot}>
          <Avatar user={message.author} size="md" presence />
        </span>
      )}

      <div className={clsx(styles.content, editing && styles.contentEditing)}>
        <div className={styles.bubble}>
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
              {mine ? null : (
                <button
                  type="button"
                  className={styles.author}
                  onClick={() => message.author && openProfile(message.author.username)}
                >
                  {message.author?.displayName ?? 'Alguien'}
                </button>
              )}
              <span className={styles.time}>{timeOf(message.createdAt)}</span>
              {message.meta?.forwarded ? (
                <span className={styles.badge}>
                  <Forward size={9} /> Reenviado
                </span>
              ) : null}
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
                  {message.pending ? (
                    <span className={styles.receipts} title="Enviando">
                      <Clock size={12} />
                    </span>
                  ) : null}
                  {mine && !message.pending && !message.failed && conversation.type === 'direct' ? (
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
              {/* Un enlace suelto se explica solo; con adjuntos ya hay bastante. */}
              {link && message.attachments.length === 0 ? <LinkPreviewCard url={link} /> : null}
            </>
          )}
        </div>

        {/* No llegó a salir: se queda a la vista, con la salida en la mano. */}
        {message.failed ? (
          <div className={styles.failed}>
            <AlertCircle size={13} />
            No se pudo enviar
            <button
              type="button"
              className={styles.failedAction}
              onClick={() =>
                void chat
                  .retryMessage(conversation.id, message.id)
                  .catch(() => toastError(new Error('Sigue sin poder enviarse')))
              }
            >
              Reintentar
            </button>
            <button
              type="button"
              className={styles.failedAction}
              onClick={() => chat.discardMessage(conversation.id, message.id)}
            >
              Descartar
            </button>
          </div>
        ) : null}

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

      {!message.deletedAt && !editing && !selecting && !message.pending && !message.failed ? (
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
        <Menu anchor={menu.anchor} open={menu.open} onClose={menu.close} label="Acciones del mensaje">
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
            icon={<CheckSquare size={16} />}
            onSelect={() => {
              chat.startSelection(message.id);
              menu.close();
            }}
          >
            Seleccionar
          </MenuItem>
          <MenuItem
            icon={<Forward size={16} />}
            onSelect={() => {
              onForward?.(message);
              menu.close();
            }}
          >
            Reenviar
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
