import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { FileText, Link2, LogOut, UserPlus, Users, X } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { Attachment, Conversation, Message, PublicUser } from '@kyro/shared';
import { ROLE_LABEL, ROLE_RANK } from '@kyro/shared';
import { api } from '@/lib/api';
import { dur } from '@/lib/motion';
import { conversationName, otherMember } from '@/lib/conversation';
import { fileSize, presenceLine } from '@/lib/format';
import { useChat } from '@/store/chat';
import { useSession } from '@/store/session';
import { usePresenceOf } from '@/store/presence';
import { toastError, useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, Loading } from '@/components/ui/Feedback';
import { AddMembersModal } from './AddMembersModal';
import { PromoteToCommunityModal } from './PromoteToCommunityModal';
import styles from './InfoPanel.module.css';

type Tab = 'fotos' | 'archivos' | 'enlaces';

export function InfoPanel({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const selfId = useSession((state) => state.user?.id ?? '');
  const peer = otherMember(conversation, selfId);
  const presence = usePresenceOf(peer);
  const navigate = useNavigate();
  const confirm = useUI((state) => state.confirm);
  const openProfile = useUI((state) => state.openProfile);
  const [tab, setTab] = useState<Tab>('fotos');
  const [addOpen, setAddOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  const isAdmin = ROLE_RANK[conversation.myRole] >= ROLE_RANK.admin;
  const panelRef = useRef<HTMLElement>(null);

  // Vive en el grid del chat, no en un portal: no hay salida que animar, pero
  // sí una llegada que puede sentirse deslizada en vez de aparecida.
  useGSAP(
    () => gsap.from(panelRef.current, { opacity: 0, x: 16, duration: dur('fast') }),
    { scope: panelRef },
  );

  const leave = async () => {
    const ok = await confirm({
      title: `¿Salir de ${conversationName(conversation, selfId)}?`,
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

  return (
    <aside ref={panelRef} className={styles.panel} aria-label="Detalles de la conversación">
      <header className={styles.header}>
        <span className={styles.title}>Detalles</span>
        <IconButton label="Cerrar detalles" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>

      <div className={styles.scroll}>
        {conversation.type === 'direct' && peer ? (
          <div className={styles.identity}>
            <Avatar user={peer} size="xl" presence />
            <div>
              <div className={styles.name}>{peer.displayName}</div>
              <div className={styles.handle}>@{peer.username}</div>
            </div>
            {presence ? (
              <div className={styles.handle}>
                {presenceLine(presence)}
              </div>
            ) : null}
            {peer.bio ? <p className={styles.bio}>{peer.bio}</p> : null}
            <Button size="sm" onClick={() => openProfile(peer.username)}>
              Ver perfil
            </Button>
          </div>
        ) : (
          <div className={styles.identity}>
            <Avatar
              name={conversationName(conversation, selfId)}
              src={conversation.avatarUrl}
              size="xl"
              square
            />
            <div>
              <div className={styles.name}>{conversationName(conversation, selfId)}</div>
              <div className={styles.handle}>
                {conversation.memberCount} {conversation.memberCount === 1 ? 'persona' : 'personas'}
              </div>
            </div>
            {conversation.topic ? <p className={styles.bio}>{conversation.topic}</p> : null}
          </div>
        )}

        <SharedContent conversation={conversation} tab={tab} onTab={setTab} />

        {conversation.type !== 'direct' ? (
          <MembersSection conversation={conversation} onAdd={() => setAddOpen(true)} />
        ) : null}

        <div className={styles.actions}>
          {conversation.type === 'group' && isAdmin ? (
            <Button icon={<Users size={16} />} onClick={() => setPromoteOpen(true)}>
              Convertir en comunidad
            </Button>
          ) : null}
          {conversation.type === 'group' ? (
            <Button icon={<LogOut size={16} />} variant="danger" onClick={leave}>
              Salir del grupo
            </Button>
          ) : null}
        </div>
      </div>

      <AddMembersModal
        conversation={conversation}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
      <PromoteToCommunityModal
        conversation={conversation}
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
      />
    </aside>
  );
}

function SharedContent({
  conversation,
  tab,
  onTab,
}: {
  conversation: Conversation;
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [links, setLinks] = useState<{ url: string; messageId: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        if (tab === 'enlaces') {
          const data = await api.get<{ items: Message[] }>(
            `/conversations/${conversation.id}/search`,
            { query: { q: 'http' } },
          );
          if (cancelled) return;
          const found: { url: string; messageId: string }[] = [];
          for (const message of data.items) {
            for (const match of message.content.matchAll(/https?:\/\/[^\s]+/g)) {
              found.push({ url: match[0], messageId: message.id });
            }
          }
          setLinks(found);
        } else {
          const data = await api.get<{ items: Attachment[] }>(
            `/conversations/${conversation.id}/files`,
            { query: { kind: tab === 'fotos' ? 'image' : 'file' } },
          );
          if (!cancelled) setFiles(data.items);
        }
      } catch {
        if (!cancelled) {
          setFiles([]);
          setLinks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [conversation.id, tab]);

  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>Compartido</span>
      <div className={styles.tabs} role="tablist">
        {(['fotos', 'archivos', 'enlaces'] as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            className={clsx(styles.tab, tab === option && styles.tabActive)}
            onClick={() => onTab(option)}
          >
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : tab === 'fotos' ? (
        files && files.length > 0 ? (
          <div className={styles.photos}>
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                className={styles.photo}
                onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
              >
                <img src={file.url} alt={file.name} loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin fotos todavía" />
        )
      ) : tab === 'archivos' ? (
        files && files.length > 0 ? (
          <div>
            {files.map((file) => (
              <a
                key={file.id}
                className={styles.fileRow}
                href={file.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className={styles.fileIcon}>
                  <FileText size={16} />
                </span>
                <span className={styles.fileText}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileMeta}>{fileSize(file.size)}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin archivos todavía" />
        )
      ) : links && links.length > 0 ? (
        <div>
          {links.map((link, index) => (
            <a
              key={`${link.messageId}-${index}`}
              className={styles.fileRow}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener nofollow"
            >
              <span className={styles.fileIcon}>
                <Link2 size={16} />
              </span>
              <span className={styles.fileText}>
                <span className={styles.fileName}>{link.url}</span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <EmptyState title="Sin enlaces todavía" />
      )}
    </div>
  );
}

function MembersSection({
  conversation,
  onAdd,
}: {
  conversation: Conversation;
  onAdd: () => void;
}) {
  const openProfile = useUI((state) => state.openProfile);
  const [members, setMembers] = useState<{ user: PublicUser; role: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: { user: PublicUser; role: string }[] }>(
        `/conversations/${conversation.id}/members`,
      )
      .then((data) => {
        if (!cancelled) setMembers(data.items);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id, conversation.memberCount]);

  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>Miembros · {conversation.memberCount}</span>
      {conversation.type === 'group' ? (
        <Button size="sm" icon={<UserPlus size={15} />} onClick={onAdd}>
          Añadir personas
        </Button>
      ) : null}
      {members === null ? (
        <Loading />
      ) : (
        members.slice(0, 50).map((member) => (
          <button
            key={member.user.id}
            type="button"
            className={styles.member}
            onClick={() => openProfile(member.user.username)}
          >
            <Avatar user={member.user} size="sm" presence />
            <span className={styles.memberName}>{member.user.displayName}</span>
            {member.role !== 'member' ? (
              <span className={styles.role}>{ROLE_LABEL[member.role as never]}</span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );
}
