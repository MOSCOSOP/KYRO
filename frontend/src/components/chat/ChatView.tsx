import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  BellOff,
  Copy,
  Forward,
  Hash,
  Info,
  Megaphone,
  MoreVertical,
  Phone,
  Pin,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { Conversation, Message } from '@kyro/shared';
import { api } from '@/lib/api';
import { conversationName, otherMember } from '@/lib/conversation';
import { presenceLine, timeOf } from '@/lib/format';
import { activeTypists, useChat } from '@/store/chat';
import { useCalls } from '@/store/calls';
import { usePresenceOf } from '@/store/presence';
import { useSession } from '@/store/session';
import { toastError, useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Menu, MenuItem, MenuSeparator, useMenu } from '@/components/ui/Menu';
import { useIsCompact } from '@/hooks/useMediaQuery';
import { Composer } from './Composer';
import { ConvertToGroupModal } from './ConvertToGroupModal';
import { ForwardModal } from './ForwardModal';
import { InfoPanel } from './InfoPanel';
import { MessageList } from './MessageList';
import styles from './ChatView.module.css';

export function ChatView({ conversation }: { conversation: Conversation }) {
  const selfId = useSession((state) => state.user?.id ?? '');
  const typing = useChat((state) => state.typing[conversation.id]);
  const peer = otherMember(conversation, selfId);
  const presence = usePresenceOf(peer);
  const compact = useIsCompact();
  const navigate = useNavigate();
  const menu = useMenu();
  const moreRef = useRef<HTMLButtonElement>(null);
  const confirm = useUI((state) => state.confirm);
  const setMobilePane = useUI((state) => state.setMobilePane);

  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [pinned, setPinned] = useState<Message[]>([]);
  const [forwarding, setForwarding] = useState<Message[]>([]);
  const selection = useChat((state) => state.selection);
  const [scrolled, setScrolled] = useState(false);

  // Carga del hilo y suscripción en tiempo real.
  useEffect(() => {
    useChat.getState().setActive(conversation.id);
    void useChat.getState().loadMessages(conversation.id).catch(() => undefined);
    useChat.getState().markRead(conversation.id);
    useChat.getState().clearSelection();
    return () => {
      useChat.getState().setActive(null);
      useChat.getState().clearSelection();
    };
  }, [conversation.id]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: Message[] }>(`/conversations/${conversation.id}/pinned`)
      .then((data) => {
        if (!cancelled) setPinned(data.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  const typists = activeTypists(conversation.id, typing ? { [conversation.id]: typing } : {});
  const name = conversationName(conversation, selfId);
  const canCall = conversation.type !== 'channel';

  const subtitle = () => {
    if (typists.length > 0) {
      return typists.length === 1
        ? `${typists[0].displayName} está escribiendo…`
        : 'Varias personas escribiendo…';
    }
    if (conversation.type === 'direct' && presence) {
      return presenceLine(presence);
    }
    if (conversation.type === 'channel') {
      return conversation.topic ?? 'Canal de comunidad';
    }
    return `${conversation.memberCount} miembros`;
  };

  const startCall = (kind: 'audio' | 'video') => {
    void useCalls.getState().start(conversation.id, kind, selfId);
  };

  const setFlags = async (flags: { muted?: boolean; pinned?: boolean }) => {
    try {
      const updated = await api.patch<Conversation>(
        `/conversations/${conversation.id}/settings`,
        flags,
      );
      useChat.getState().applyConversation(updated);
    } catch (err) {
      toastError(err, 'No se pudo actualizar');
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: `¿Salir de ${name}?`,
      confirmLabel: 'Salir',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/conversations/${conversation.id}/leave`);
      useChat.getState().removeConversation(conversation.id);
      navigate('/mensajes');
    } catch (err) {
      toastError(err, 'No se pudo salir');
    }
  };

  /* Acciones en lote sobre lo seleccionado. */
  const forwardSelection = () => {
    const thread = useChat.getState().threads[conversation.id];
    const picked = (thread?.messages ?? []).filter((message) => selection.includes(message.id));
    if (picked.length > 0) setForwarding(picked);
  };

  const deleteSelection = async () => {
    const ok = await confirm({
      title:
        selection.length === 1
          ? '¿Eliminar el mensaje?'
          : `¿Eliminar ${selection.length} mensajes?`,
      description: 'Se eliminarán para todos los participantes.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;

    const chat = useChat.getState();
    for (const messageId of selection) {
      await chat.deleteMessage(messageId, conversation.id).catch(() => undefined);
    }
    chat.clearSelection();
  };

  const copySelection = async () => {
    const thread = useChat.getState().threads[conversation.id];
    const text = (thread?.messages ?? [])
      .filter((message) => selection.includes(message.id))
      .map((message) => `${message.author?.displayName ?? ''}: ${message.content}`.trim())
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      useChat.getState().clearSelection();
    } catch {
      toastError(new Error('No se pudo copiar'));
    }
  };

  return (
    <div className={styles.view}>
      {selection.length > 0 ? (
        <div className={styles.selectionBar}>
          <IconButton label="Cancelar selección" onClick={() => useChat.getState().clearSelection()}>
            <X size={18} />
          </IconButton>
          <span className={styles.selectionCount}>
            {selection.length} {selection.length === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <span className={styles.selectionActions}>
            <IconButton label="Copiar" onClick={() => void copySelection()}>
              <Copy size={18} />
            </IconButton>
            <IconButton label="Reenviar" onClick={forwardSelection}>
              <Forward size={18} />
            </IconButton>
            <IconButton label="Eliminar" danger onClick={() => void deleteSelection()}>
              <Trash2 size={18} />
            </IconButton>
          </span>
        </div>
      ) : null}

      <header className={clsx(styles.header, scrolled && styles.headerRaised)}>
        <IconButton
          label="Volver"
          className={styles.back}
          onClick={() => {
            setMobilePane('list');
            navigate(conversation.communityId ? `/comunidades/${conversation.communityId}` : '/mensajes');
          }}
        >
          <ArrowLeft size={18} />
        </IconButton>

        <button type="button" className={styles.identity} onClick={() => setInfoOpen((open) => !open)}>
          {conversation.type === 'direct' && peer ? (
            <Avatar user={peer} size="md" presence />
          ) : conversation.type === 'channel' ? (
            conversation.channelKind === 'announcement' ? (
              <Megaphone size={19} />
            ) : (
              <Hash size={20} />
            )
          ) : (
            <Avatar name={name} src={conversation.avatarUrl} size="md" square />
          )}
          <span className={styles.identityText}>
            <span className={styles.name}>{name}</span>
            <span className={clsx(styles.subtitle, typists.length > 0 && styles.subtitleAccent)}>
              {subtitle()}
            </span>
          </span>
        </button>

        <div className={styles.actions}>
          {canCall ? (
            <>
              <IconButton label="Llamar" onClick={() => startCall('audio')}>
                <Phone size={18} />
              </IconButton>
              <IconButton label="Videollamada" onClick={() => startCall('video')}>
                <Video size={18} />
              </IconButton>
            </>
          ) : null}
          {/* En móvil el nombre necesita el sitio: estos dos pasan al menú. */}
          {!compact ? (
            <>
              <IconButton
                label="Buscar en la conversación"
                active={searchOpen}
                onClick={() => setSearchOpen((open) => !open)}
              >
                <Search size={18} />
              </IconButton>
              <IconButton
                label="Detalles"
                active={infoOpen}
                onClick={() => setInfoOpen((open) => !open)}
              >
                <Info size={18} />
              </IconButton>
            </>
          ) : null}
          <IconButton ref={moreRef} label="Más opciones" onClick={() => menu.openFrom(moreRef.current)}>
            <MoreVertical size={18} />
          </IconButton>
        </div>
      </header>

      {pinned.length > 0 ? (
        <div className={styles.pinnedBar}>
          <Pin size={14} />
          <button
            type="button"
            className={styles.pinnedText}
            onClick={() => {
              const target = document.getElementById(`msg-${pinned[0].id}`);
              target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            {pinned[0].content || 'Mensaje con archivos'}
          </button>
          {pinned.length > 1 ? <span>+{pinned.length - 1}</span> : null}
        </div>
      ) : null}

      {searchOpen ? (
        <ConversationSearch conversation={conversation} onClose={() => setSearchOpen(false)} />
      ) : null}

      <div className={clsx(styles.body, infoOpen && !compact && styles.bodyWithPanel)}>
        <div className={styles.thread}>
          <MessageList
            conversation={conversation}
            onForward={(message) => setForwarding([message])}
            onScrolled={setScrolled}
          />
          <Composer conversation={conversation} />
        </div>
        {infoOpen && !compact ? (
          <InfoPanel conversation={conversation} onClose={() => setInfoOpen(false)} />
        ) : null}
      </div>

      {menu.anchor ? (
        <Menu anchor={menu.anchor} onClose={menu.close} label="Opciones de la conversación">
          {compact ? (
            <>
              <MenuItem
                icon={<Search size={16} />}
                onSelect={() => {
                  setSearchOpen(true);
                  menu.close();
                }}
              >
                Buscar en la conversación
              </MenuItem>
              <MenuItem
                icon={<Info size={16} />}
                onSelect={() => {
                  setInfoOpen(true);
                  menu.close();
                }}
              >
                Detalles
              </MenuItem>
              <MenuSeparator />
            </>
          ) : null}
          <MenuItem
            icon={<BellOff size={16} />}
            onSelect={() => {
              void setFlags({ muted: !conversation.muted });
              menu.close();
            }}
          >
            {conversation.muted ? 'Activar notificaciones' : 'Silenciar'}
          </MenuItem>
          {conversation.type !== 'channel' ? (
            <MenuItem
              icon={<Pin size={16} />}
              onSelect={() => {
                void setFlags({ pinned: !conversation.pinned });
                menu.close();
              }}
            >
              {conversation.pinned ? 'No fijar' : 'Fijar arriba'}
            </MenuItem>
          ) : null}
          {conversation.type === 'direct' ? (
            <MenuItem
              icon={<Users size={16} />}
              onSelect={() => {
                setConvertOpen(true);
                menu.close();
              }}
            >
              Crear un grupo con esta conversación
            </MenuItem>
          ) : null}
          {conversation.channelKind === 'announcement' ? (
            <MenuItem icon={<Megaphone size={16} />} disabled onSelect={() => undefined}>
              Canal de anuncios
            </MenuItem>
          ) : null}
          {conversation.type === 'group' ? (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<X size={16} />}
                danger
                onSelect={() => {
                  void leave();
                  menu.close();
                }}
              >
                Salir del grupo
              </MenuItem>
            </>
          ) : null}
        </Menu>
      ) : null}

      {infoOpen && compact ? (
        <InfoPanel conversation={conversation} onClose={() => setInfoOpen(false)} />
      ) : null}

      <ForwardModal
        messages={forwarding}
        onClose={() => {
          setForwarding([]);
          useChat.getState().clearSelection();
        }}
      />

      <ConvertToGroupModal
        conversation={conversation}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
      />
    </div>
  );
}

function ConversationSearch({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.get<{ items: Message[] }>(
          `/conversations/${conversation.id}/search`,
          { query: { q: query.trim() } },
        );
        if (!cancelled) setResults(data.items);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, conversation.id]);

  return (
    <>
      <div className={styles.searchBar}>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en esta conversación"
          aria-label="Buscar en esta conversación"
          icon={<Search size={15} />}
          autoFocus
        />
        <IconButton label="Cerrar búsqueda" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      {results.length > 0 ? (
        <div className={styles.searchResults}>
          {results.map((message) => (
            <button
              key={message.id}
              type="button"
              className={styles.pinnedText}
              style={{ display: 'block', padding: '8px 16px' }}
              onClick={() => {
                const target = document.getElementById(`msg-${message.id}`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <strong>{message.author?.displayName ?? 'Alguien'}</strong> · {timeOf(message.createdAt)}
              <br />
              {message.content}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
