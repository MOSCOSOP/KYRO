import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { FileText, Hash, MessageCircle, Search, Users } from 'lucide-react';
import type { SearchResults } from '@kyro/shared';
import { api } from '@/lib/api';
import { conversationName } from '@/lib/conversation';
import { shortStamp } from '@/lib/format';
import { useSession } from '@/store/session';
import { useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Feedback';
import styles from './CommandPalette.module.css';

interface Entry {
  id: string;
  group: string;
  name: string;
  meta?: string;
  avatar?: { name: string; src: string | null; square?: boolean };
  user?: SearchResults['people'][number];
  icon?: 'chat' | 'channel' | 'community' | 'file';
  to: string;
}

const EMPTY: SearchResults = {
  people: [],
  conversations: [],
  communities: [],
  channels: [],
  messages: [],
  files: [],
};

/** Una sola caja para encontrar cualquier cosa dentro de KYRO. */
export function CommandPalette() {
  const open = useUI((state) => state.searchOpen);
  const close = useUI((state) => state.closeSearch);
  const selfId = useSession((state) => state.user?.id ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY);
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.get<SearchResults>('/search', { query: { q: term } });
        if (!cancelled) {
          setResults(data);
          setIndex(0);
        }
      } catch {
        if (!cancelled) setResults(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];

    for (const person of results.people) {
      list.push({
        id: `person-${person.id}`,
        group: 'Personas',
        name: person.displayName,
        meta: `@${person.username}`,
        user: person,
        to: `/u/${person.username}`,
      });
    }
    for (const conversation of results.conversations) {
      list.push({
        id: `conv-${conversation.id}`,
        group: 'Conversaciones',
        name: conversationName(conversation, selfId),
        meta: conversation.lastMessage?.content,
        icon: 'chat',
        to: `/mensajes/${conversation.id}`,
      });
    }
    for (const community of results.communities) {
      list.push({
        id: `community-${community.id}`,
        group: 'Comunidades',
        name: community.name,
        meta: `${community.memberCount} miembros`,
        avatar: { name: community.name, src: community.iconUrl, square: true },
        to: `/comunidades/${community.id}`,
      });
    }
    for (const channel of results.channels) {
      list.push({
        id: `channel-${channel.id}`,
        group: 'Canales',
        name: channel.name ?? 'canal',
        meta: channel.topic ?? undefined,
        icon: 'channel',
        to: channel.communityId
          ? `/comunidades/${channel.communityId}/${channel.id}`
          : `/mensajes/${channel.id}`,
      });
    }
    for (const message of results.messages) {
      list.push({
        id: `message-${message.id}`,
        group: 'Mensajes',
        name: message.content.slice(0, 90),
        meta: `${message.author?.displayName ?? 'Alguien'} · ${shortStamp(message.createdAt)}`,
        user: message.author ?? undefined,
        to: `/mensajes/${message.conversationId}`,
      });
    }
    for (const file of results.files) {
      list.push({
        id: `file-${file.id}`,
        group: 'Archivos',
        name: file.name,
        meta: file.conversationName,
        icon: 'file',
        to: `/mensajes/${file.conversationId}`,
      });
    }

    return list;
  }, [results, selfId]);

  if (!open) return null;

  const choose = (entry: Entry) => {
    close();
    navigate(entry.to);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((current) => Math.min(current + 1, entries.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === 'Enter' && entries[index]) {
      event.preventDefault();
      choose(entries[index]);
    }
  };

  let lastGroup = '';

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en KYRO"
        onKeyDown={onKeyDown}
      >
        <div className={styles.searchRow}>
          <Search size={18} color="var(--text-tertiary)" />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca personas, conversaciones, comunidades, mensajes…"
            aria-label="Buscar"
          />
          {loading ? <Spinner size={14} /> : <span className={styles.hint}>Esc</span>}
        </div>

        <div className={styles.results}>
          {query.trim().length < 2 ? (
            <div className={styles.group}>Escribe al menos dos letras</div>
          ) : entries.length === 0 && !loading ? (
            <div className={styles.group}>Sin resultados</div>
          ) : (
            entries.map((entry, position) => {
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              return (
                <div key={entry.id}>
                  {header ? <div className={styles.group}>{header}</div> : null}
                  <button
                    type="button"
                    className={clsx(styles.result, position === index && styles.active)}
                    onMouseEnter={() => setIndex(position)}
                    onClick={() => choose(entry)}
                  >
                    {entry.user ? (
                      <Avatar user={entry.user} size="sm" />
                    ) : entry.avatar ? (
                      <Avatar
                        name={entry.avatar.name}
                        src={entry.avatar.src}
                        size="sm"
                        square={entry.avatar.square}
                      />
                    ) : (
                      <span className={styles.icon}>
                        {entry.icon === 'channel' ? (
                          <Hash size={15} />
                        ) : entry.icon === 'community' ? (
                          <Users size={15} />
                        ) : entry.icon === 'file' ? (
                          <FileText size={15} />
                        ) : (
                          <MessageCircle size={15} />
                        )}
                      </span>
                    )}
                    <span className={styles.text}>
                      <span className={styles.name}>{entry.name}</span>
                      {entry.meta ? <span className={styles.meta}>{entry.meta}</span> : null}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <span>↑↓ moverse</span>
          <span>↵ abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
