import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Bell,
  Bookmark,
  CornerDownLeft,
  FileText,
  Hash,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  Search,
  Settings,
  SmilePlus,
  User,
  Users,
} from 'lucide-react';
import type { PresenceStatus, PublicUser, SearchResults } from '@kyro/shared';
import { api } from '@/lib/api';
import { conversationName } from '@/lib/conversation';
import { PRESENCE_LABEL, shortStamp } from '@/lib/format';
import { useCalls } from '@/store/calls';
import { useChat } from '@/store/chat';
import { useSession } from '@/store/session';
import { toastError, useUI } from '@/store/ui';
import { Avatar, PresenceDot } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Feedback';
import { KyroMark } from '@/components/brand/KyroMark';
import styles from './CommandPalette.module.css';

interface Entry {
  id: string;
  group: string;
  name: string;
  meta?: string;
  icon?: ReactNode;
  user?: PublicUser;
  /** Palabras extra por las que la acción también se encuentra. */
  keywords?: string;
  run: () => void;
}

const EMPTY: SearchResults = {
  people: [],
  conversations: [],
  communities: [],
  channels: [],
  messages: [],
  files: [],
};

/**
 * Una sola tecla para todo KYRO: buscar personas, saltar a una conversación,
 * llamar, cambiar de estado o abrir los ajustes. Sin ratón si no quieres.
 */
export function CommandPalette() {
  const open = useUI((state) => state.searchOpen);
  const close = useUI((state) => state.closeSearch);
  const openModal = useUI((state) => state.openModal);
  const openProfile = useUI((state) => state.openProfile);
  const user = useSession((state) => state.user);
  const setPresence = useSession((state) => state.setPresence);
  const conversations = useChat((state) => state.conversations);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY);
      setIndex(0);
    }
  }, [open]);

  /* Búsqueda en el servidor: solo cuando hay algo que buscar. */
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.get<SearchResults>('/search', { query: { q: term } });
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const go = (to: string) => {
    close();
    navigate(to);
  };

  /**
   * Abre la conversación directa con alguien (creándola si hace falta) y, si se
   * pidió, arranca la llamada. Es lo que hace útil escribir `@usuario` aquí.
   */
  const quickConnect = async (person: PublicUser, intent: 'message' | 'call') => {
    close();
    try {
      const existing = useChat
        .getState()
        .conversations.find(
          (conversation) =>
            conversation.type === 'direct' &&
            conversation.members.some((member) => member.id === person.id),
        );

      let conversationId = existing?.id;
      if (!conversationId) {
        const conversation = await api.post<{ id: string }>('/conversations/direct', {
          userId: person.id,
        });
        void useChat.getState().loadConversations();
        conversationId = conversation.id;
      }

      if (intent === 'call') {
        navigate(`/mensajes/${conversationId}`);
        void useCalls.getState().start(conversationId, 'audio', user?.id ?? '');
      } else {
        navigate(`/mensajes/${conversationId}`);
      }
    } catch (err) {
      toastError(err, 'No se pudo conectar con esa persona');
    }
  };

  /* Acciones: lo que KYRO puede hacer, no lo que contiene. */
  const actions = useMemo<Entry[]>(() => {
    const statusEntries: Entry[] = (
      ['available', 'away', 'dnd', 'invisible'] as Exclude<PresenceStatus, 'offline'>[]
    ).map((status) => ({
      id: `status-${status}`,
      group: 'Estado',
      name: PRESENCE_LABEL[status],
      meta: user?.status === status ? 'Estado actual' : undefined,
      icon: <PresenceDot status={status} size="md" />,
      keywords: 'estado presencia disponible ausente ocupado invisible',
      run: () => {
        void setPresence(status);
        close();
      },
    }));

    return [
      {
        id: 'action-new',
        group: 'Acciones',
        name: 'Nueva conversación',
        meta: 'Escribir a alguien o crear un grupo',
        icon: <MessageSquarePlus size={16} />,
        keywords: 'mensaje nuevo chat grupo escribir',
        run: () => openModal('new-conversation'),
      },
      {
        id: 'action-saved',
        group: 'Acciones',
        name: 'Mensajes guardados',
        icon: <Bookmark size={16} />,
        keywords: 'guardados marcadores',
        run: () => openModal('saved-messages'),
      },
      {
        id: 'action-status',
        group: 'Acciones',
        name: 'Cambiar tu estado',
        meta: 'Texto y actividad',
        icon: <SmilePlus size={16} />,
        keywords: 'estado personalizado actividad',
        run: () => openModal('custom-status'),
      },
      {
        id: 'action-profile',
        group: 'Acciones',
        name: 'Ver mi perfil',
        icon: <User size={16} />,
        keywords: 'perfil cuenta yo',
        run: () => {
          close();
          if (user) openProfile(user.username);
        },
      },
      {
        id: 'action-calls',
        group: 'Acciones',
        name: 'Historial de llamadas',
        icon: <Phone size={16} />,
        keywords: 'llamadas historial',
        run: () => go('/llamadas'),
      },
      {
        id: 'action-activity',
        group: 'Acciones',
        name: 'Actividad',
        icon: <Bell size={16} />,
        keywords: 'notificaciones actividad',
        run: () => go('/actividad'),
      },
      {
        id: 'action-communities',
        group: 'Acciones',
        name: 'Comunidades',
        icon: <Users size={16} />,
        keywords: 'comunidades canales salas',
        run: () => go('/comunidades'),
      },
      {
        id: 'action-settings',
        group: 'Acciones',
        name: 'Ajustes',
        icon: <Settings size={16} />,
        keywords: 'configuración ajustes preferencias',
        run: () => go('/ajustes'),
      },
      ...statusEntries,
    ];
  }, [openModal, setPresence, user, close, navigate]);

  const entries = useMemo<Entry[]>(() => {
    const term = query.trim().toLowerCase();
    const selfId = user?.id ?? '';

    /* Sin texto: acciones y las conversaciones recientes. */
    if (!term) {
      const recent: Entry[] = conversations.slice(0, 5).map((conversation) => ({
        id: `recent-${conversation.id}`,
        group: 'Recientes',
        name: conversationName(conversation, selfId),
        meta: shortStamp(conversation.lastMessageAt),
        icon: <MessageCircle size={16} />,
        run: () => go(`/mensajes/${conversation.id}`),
      }));
      return [...recent, ...actions.filter((action) => action.group === 'Acciones')];
    }

    const matched = actions.filter((action) =>
      `${action.name} ${action.keywords ?? ''}`.toLowerCase().includes(term),
    );

    const found: Entry[] = [];

    /*
     * Conexión rápida: al escribir @alguien, lo primero que ofrece KYRO es
     * hablar o llamar, no un resultado que haya que abrir antes.
     */
    if (term.startsWith('@')) {
      for (const person of results.people.slice(0, 3)) {
        found.push({
          id: `quick-message-${person.id}`,
          group: 'Conectar',
          name: `Escribir a ${person.displayName}`,
          meta: `@${person.username}`,
          icon: <MessageSquarePlus size={16} />,
          run: () => void quickConnect(person, 'message'),
        });
        found.push({
          id: `quick-call-${person.id}`,
          group: 'Conectar',
          name: `Llamar a ${person.displayName}`,
          meta: `@${person.username}`,
          icon: <Phone size={16} />,
          run: () => void quickConnect(person, 'call'),
        });
      }
    }

    for (const person of results.people) {
      found.push({
        id: `person-${person.id}`,
        group: 'Personas',
        name: person.displayName,
        meta: `@${person.username}`,
        user: person,
        run: () => {
          close();
          openProfile(person.username);
        },
      });
    }
    for (const conversation of results.conversations) {
      found.push({
        id: `conv-${conversation.id}`,
        group: 'Conversaciones',
        name: conversationName(conversation, selfId),
        meta: conversation.lastMessage?.content,
        icon: <MessageCircle size={16} />,
        run: () => go(`/mensajes/${conversation.id}`),
      });
    }
    for (const community of results.communities) {
      found.push({
        id: `community-${community.id}`,
        group: 'Comunidades',
        name: community.name,
        meta: `${community.memberCount} miembros`,
        icon: <Users size={16} />,
        run: () => go(`/comunidades/${community.id}`),
      });
    }
    for (const channel of results.channels) {
      found.push({
        id: `channel-${channel.id}`,
        group: 'Canales',
        name: channel.name ?? 'canal',
        meta: channel.topic ?? undefined,
        icon: <Hash size={16} />,
        run: () =>
          go(
            channel.communityId
              ? `/comunidades/${channel.communityId}/${channel.id}`
              : `/mensajes/${channel.id}`,
          ),
      });
    }
    for (const message of results.messages) {
      found.push({
        id: `message-${message.id}`,
        group: 'Mensajes',
        name: message.content.slice(0, 80),
        meta: `${message.author?.displayName ?? 'Alguien'} · ${shortStamp(message.createdAt)}`,
        user: message.author ?? undefined,
        run: () => go(`/mensajes/${message.conversationId}`),
      });
    }
    for (const file of results.files) {
      found.push({
        id: `file-${file.id}`,
        group: 'Archivos',
        name: file.name,
        meta: file.conversationName,
        icon: <FileText size={16} />,
        run: () => go(`/mensajes/${file.conversationId}`),
      });
    }

    return [...matched, ...found];
  }, [query, actions, results, conversations, user, go, quickConnect]);

  /* La fila activa se mantiene a la vista al moverse con el teclado. */
  useEffect(() => {
    const element = listRef.current?.querySelector(`[data-index="${index}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((current) => (current + 1) % Math.max(entries.length, 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((current) => (current - 1 + entries.length) % Math.max(entries.length, 1));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      entries[index]?.run();
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
        aria-label="Comandos y búsqueda"
        onKeyDown={onKeyDown}
      >
        <div className={styles.searchRow}>
          <KyroMark size={22} />
          <input
            className={styles.input}
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca o escribe una acción"
            aria-label="Buscar o ejecutar una acción"
          />
          {loading ? <Spinner size={14} /> : <span className={styles.hint}>ESC</span>}
        </div>

        <div className={styles.results} ref={listRef}>
          {entries.length === 0 ? (
            <p className={styles.empty}>
              {loading ? 'Buscando…' : 'Nada coincide con lo que has escrito.'}
            </p>
          ) : (
            entries.map((entry, position) => {
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              return (
                <div key={entry.id}>
                  {header ? <div className={styles.group}>{header}</div> : null}
                  <button
                    type="button"
                    data-index={position}
                    className={clsx(styles.result, position === index && styles.active)}
                    onMouseMove={() => setIndex(position)}
                    onClick={entry.run}
                  >
                    {entry.user ? (
                      <Avatar user={entry.user} size="sm" presence />
                    ) : (
                      <span className={styles.icon}>{entry.icon ?? <Search size={15} />}</span>
                    )}
                    <span className={styles.text}>
                      <span className={styles.name}>{entry.name}</span>
                      {entry.meta ? <span className={styles.meta}>{entry.meta}</span> : null}
                    </span>
                    <span className={styles.enter}>
                      <CornerDownLeft size={13} />
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <span>
            <span className={styles.key}>↑↓</span>moverse
          </span>
          <span>
            <span className={styles.key}>↵</span>abrir
          </span>
          <span>
            <span className={styles.key}>esc</span>cerrar
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
