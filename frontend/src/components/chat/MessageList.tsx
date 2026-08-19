import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Hash, MessageCircle } from 'lucide-react';
import type { Conversation, Message } from '@kyro/shared';
import { conversationName, isGrouped, isSameDay } from '@/lib/conversation';
import { dayLabel } from '@/lib/format';
import { activeTypists, useChat } from '@/store/chat';
import { useSession } from '@/store/session';
import { Avatar } from '@/components/ui/Avatar';
import { Loading, Spinner } from '@/components/ui/Feedback';
import { MessageItem } from './MessageItem';
import styles from './MessageList.module.css';

export function MessageList({
  conversation,
  onForward,
  onScrolled,
}: {
  conversation: Conversation;
  onForward?: (message: Message) => void;
  /** El hilo se ha movido del principio: la cabecera gana relieve. */
  onScrolled?: (scrolled: boolean) => void;
}) {
  const selfId = useSession((state) => state.user?.id ?? '');
  const thread = useChat((state) => state.threads[conversation.id]);
  const typing = useChat((state) => state.typing[conversation.id]);
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const previousHeight = useRef(0);
  const messages = thread?.messages ?? [];
  const lastId = messages[messages.length - 1]?.id;

  // Al abrir la conversación, abajo del todo.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !thread?.loaded) return;
    element.scrollTop = element.scrollHeight;
    setAtBottom(true);
  }, [conversation.id, thread?.loaded]);

  // Mensajes nuevos: se sigue el hilo solo si ya estabas al final.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !lastId) return;
    if (atBottom) element.scrollTop = element.scrollHeight;
  }, [lastId, atBottom]);

  const onScroll = useCallback(() => {
    const element = scroller.current;
    if (!element) return;

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setAtBottom(distanceToBottom < 80);
    onScrolled?.(element.scrollTop > 8);

    if (element.scrollTop < 320 && thread?.hasMore && !thread.loading) {
      previousHeight.current = element.scrollHeight;
      void useChat
        .getState()
        .loadOlder(conversation.id)
        .then(() => {
          // Se mantiene la posición visual tras insertar mensajes arriba.
          requestAnimationFrame(() => {
            const next = scroller.current;
            if (!next) return;
            next.scrollTop = next.scrollHeight - previousHeight.current;
          });
        })
        .catch(() => undefined);
    }
  }, [conversation.id, thread?.hasMore, thread?.loading, onScrolled]);

  const jumpTo = useCallback((messageId: string) => {
    const target = document.getElementById(`msg-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(messageId);
    window.setTimeout(() => setHighlighted(null), 1600);
  }, []);

  const typists = activeTypists(conversation.id, typing ? { [conversation.id]: typing } : {});

  if (!thread?.loaded && thread?.loading !== false) {
    return <Loading label="Cargando mensajes" />;
  }

  return (
    <>
      <div className={styles.scroller} ref={scroller} onScroll={onScroll}>
        {thread.hasMore ? (
          <div className={styles.top}>{thread.loading ? <Spinner size={16} /> : null}</div>
        ) : (
          <Intro conversation={conversation} selfId={selfId} />
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
          return (
            <div key={message.id}>
              {newDay ? (
                <div className={styles.daySeparator}>
                  <span className={styles.dayLine} />
                  <span className={styles.dayLabel}>{dayLabel(message.createdAt)}</span>
                  <span className={styles.dayLine} />
                </div>
              ) : null}
              <MessageItem
                message={message}
                conversation={conversation}
                selfId={selfId}
                grouped={!newDay && isGrouped(previous, message)}
                highlighted={highlighted === message.id}
                onJumpTo={jumpTo}
                onForward={onForward}
              />
            </div>
          );
        })}

        {!atBottom ? (
          <button
            type="button"
            className={styles.jump}
            onClick={() => {
              const element = scroller.current;
              if (element) element.scrollTop = element.scrollHeight;
            }}
          >
            <ArrowDown size={14} />
            Ir al final
          </button>
        ) : null}
      </div>

      <div className={styles.typing} aria-live="polite">
        {typists.length > 0 ? (
          <>
            <span className={styles.typingFaces} aria-hidden>
              {typists.slice(0, 3).map((person) => (
                <Avatar key={person.id} user={person} size="xs" className={styles.typingFace} />
              ))}
            </span>
            <span className={styles.dots} aria-hidden>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </span>
            <span className={styles.typingText}>
              {typists.length === 1
                ? `${typists[0].displayName.split(' ')[0]} está escribiendo`
                : `${typists.length} personas están escribiendo`}
            </span>
          </>
        ) : null}
      </div>
    </>
  );
}

function Intro({ conversation, selfId }: { conversation: Conversation; selfId: string }) {
  const name = conversationName(conversation, selfId);

  return (
    <div className={styles.intro}>
      <span className={styles.introTitle}>
        {conversation.type === 'channel' ? (
          <>
            <Hash size={20} style={{ display: 'inline', verticalAlign: '-3px' }} /> {name}
          </>
        ) : (
          name
        )}
      </span>
      <p className={styles.introText}>
        {conversation.type === 'direct' ? (
          <>Este es el principio de tu conversación con {name}.</>
        ) : conversation.type === 'channel' ? (
          <>
            {conversation.topic ?? `Este es el comienzo del canal ${name}.`}
            {conversation.channelKind === 'announcement'
              ? ' Solo el equipo de la comunidad puede publicar aquí.'
              : ''}
          </>
        ) : (
          <>
            <MessageCircle size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Aquí
            empieza {name}. {conversation.memberCount} personas dentro.
          </>
        )}
      </p>
    </div>
  );
}
