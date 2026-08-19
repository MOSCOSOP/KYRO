import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  BellOff,
  Bookmark,
  CheckCheck,
  LogOut,
  MessageSquarePlus,
  Pin,
  PinOff,
  Search,
  Users,
} from 'lucide-react';
import type { Conversation } from '@kyro/shared';
import { api } from '@/lib/api';
import { conversationAvatar, conversationName, previewText } from '@/lib/conversation';
import { shortStamp } from '@/lib/format';
import { activeTypists, useChat } from '@/store/chat';
import { useSession } from '@/store/session';
import { toastError, useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Badge, EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { Menu, MenuItem, MenuSeparator, useMenu } from '@/components/ui/Menu';
import { otherMember } from '@/lib/conversation';
import styles from './ConversationList.module.css';

export function ConversationList({ activeId }: { activeId?: string }) {
  const selfId = useSession((state) => state.user?.id ?? '');
  const conversations = useChat((state) => state.conversations);
  const loaded = useChat((state) => state.conversationsLoaded);
  const typing = useChat((state) => state.typing);
  const [query, setQuery] = useState('');
  const openModal = useUI((state) => state.openModal);
  const menu = useMenu();
  const [menuTarget, setMenuTarget] = useState<Conversation | null>(null);
  const confirm = useUI((state) => state.confirm);
  const navigate = useNavigate();

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const direct = conversations.filter((conversation) => conversation.type !== 'channel');
    if (!term) return direct;
    return direct.filter((conversation) =>
      conversationName(conversation, selfId).toLowerCase().includes(term),
    );
  }, [conversations, query, selfId]);

  const pinned = visible.filter((conversation) => conversation.pinned);
  const rest = visible.filter((conversation) => !conversation.pinned);

  const setFlags = async (conversation: Conversation, flags: { muted?: boolean; pinned?: boolean }) => {
    try {
      const updated = await api.patch<Conversation>(`/conversations/${conversation.id}/settings`, flags);
      useChat.getState().applyConversation(updated);
    } catch (err) {
      toastError(err, 'No se pudo actualizar la conversación');
    }
  };

  const leave = async (conversation: Conversation) => {
    const ok = await confirm({
      title: `¿Salir de ${conversationName(conversation, selfId)}?`,
      description: 'Dejarás de recibir sus mensajes.',
      confirmLabel: 'Salir',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/conversations/${conversation.id}/leave`);
      useChat.getState().removeConversation(conversation.id);
      navigate('/mensajes');
    } catch (err) {
      toastError(err, 'No se pudo salir del grupo');
    }
  };

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.title}>Mensajes</span>
        <span style={{ display: 'flex', gap: 2 }}>
          <IconButton label="Mensajes guardados" onClick={() => openModal('saved-messages')}>
            <Bookmark size={17} />
          </IconButton>
          <IconButton label="Nueva conversación" onClick={() => openModal('new-conversation')}>
            <MessageSquarePlus size={18} />
          </IconButton>
        </span>
      </header>

      <div className={styles.search}>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar conversación"
          aria-label="Buscar conversación"
          icon={<Search size={15} />}
        />
      </div>

      <div className={styles.list}>
        {!loaded ? (
          <SkeletonList rows={7} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<MessageSquarePlus size={20} />}
            title={query ? 'Nada por aquí' : 'Empieza a hablar'}
            description={
              query
                ? 'Prueba con otro nombre.'
                : 'Abre una conversación con alguien o crea un grupo.'
            }
          />
        ) : (
          <>
            {pinned.length > 0 ? (
              <>
                <div className={styles.sectionLabel}>Fijadas</div>
                {pinned.map((conversation) => (
                  <Row
                    key={conversation.id}
                    conversation={conversation}
                    selfId={selfId}
                    active={conversation.id === activeId}
                    typists={activeTypists(conversation.id, typing).length > 0}
                    onContextMenu={(event) => {
                      setMenuTarget(conversation);
                      menu.openAt(event);
                    }}
                  />
                ))}
                {rest.length > 0 ? <div className={styles.sectionLabel}>Recientes</div> : null}
              </>
            ) : null}

            {rest.map((conversation) => (
              <Row
                key={conversation.id}
                conversation={conversation}
                selfId={selfId}
                active={conversation.id === activeId}
                typists={activeTypists(conversation.id, typing).length > 0}
                onContextMenu={(event) => {
                  setMenuTarget(conversation);
                  menu.openAt(event);
                }}
              />
            ))}
          </>
        )}
      </div>

      {menu.anchor && menuTarget ? (
        <Menu anchor={menu.anchor} onClose={menu.close} label="Opciones de la conversación">
          <MenuItem
            icon={menuTarget.pinned ? <PinOff size={16} /> : <Pin size={16} />}
            onSelect={() => {
              void setFlags(menuTarget, { pinned: !menuTarget.pinned });
              menu.close();
            }}
          >
            {menuTarget.pinned ? 'No fijar' : 'Fijar arriba'}
          </MenuItem>
          <MenuItem
            icon={<BellOff size={16} />}
            onSelect={() => {
              void setFlags(menuTarget, { muted: !menuTarget.muted });
              menu.close();
            }}
          >
            {menuTarget.muted ? 'Activar notificaciones' : 'Silenciar'}
          </MenuItem>
          <MenuItem
            icon={<CheckCheck size={16} />}
            disabled={menuTarget.unreadCount === 0}
            onSelect={() => {
              useChat.getState().markRead(menuTarget.id);
              menu.close();
            }}
          >
            Marcar como leída
          </MenuItem>
          {menuTarget.type === 'group' ? (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<LogOut size={16} />}
                danger
                onSelect={() => {
                  void leave(menuTarget);
                  menu.close();
                }}
              >
                Salir del grupo
              </MenuItem>
            </>
          ) : null}
        </Menu>
      ) : null}

    </div>
  );
}

function Row({
  conversation,
  selfId,
  active,
  typists,
  onContextMenu,
}: {
  conversation: Conversation;
  selfId: string;
  active: boolean;
  typists: boolean;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const name = conversationName(conversation, selfId);
  const peer = otherMember(conversation, selfId);

  return (
    <Link
      to={`/mensajes/${conversation.id}`}
      className={clsx(
        styles.item,
        active && styles.itemActive,
        conversation.unreadCount > 0 && styles.unread,
      )}
      onContextMenu={onContextMenu}
    >
      {conversation.type === 'direct' && peer ? (
        <Avatar user={peer} size="md" presence />
      ) : conversation.avatarUrl ? (
        <Avatar name={name} src={conversationAvatar(conversation, selfId)} size="md" square />
      ) : (
        <span className={styles.groupIcon}>
          <Users size={17} />
        </span>
      )}

      <div className={styles.body}>
        <div className={styles.topLine}>
          <span className={styles.name}>{name}</span>
          <span className={styles.stamp}>{shortStamp(conversation.lastMessageAt)}</span>
        </div>
        <div className={styles.bottomLine}>
          <span className={clsx(styles.preview, typists && styles.typing)}>
            {typists ? 'escribiendo…' : previewText(conversation, selfId)}
          </span>
          <span className={styles.icons}>
            {conversation.muted ? <BellOff size={13} /> : null}
            {conversation.pinned ? <Pin size={13} /> : null}
            <Badge count={conversation.unreadCount} muted={conversation.muted} />
          </span>
        </div>
      </div>
    </Link>
  );
}
