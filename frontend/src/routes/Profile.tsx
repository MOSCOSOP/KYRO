import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Phone, UserCheck, UserPlus, Users, Video } from 'lucide-react';
import type { Conversation, ContactStatus, PublicUser } from '@kyro/shared';
import { api } from '@/lib/api';
import { pageTitle } from '@/config/brand';
import { fullStamp, lastSeenLabel } from '@/lib/format';
import { useCalls } from '@/store/calls';
import { useChat } from '@/store/chat';
import { usePresenceOf } from '@/store/presence';
import { useSession } from '@/store/session';
import { toastError, toastOk } from '@/store/ui';
import { Workspace } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Loading } from '@/components/ui/Feedback';
import styles from '@/components/communities/Communities.module.css';

interface ProfileResponse {
  user: PublicUser;
  communities: { id: string; name: string; iconUrl: string | null; slug: string }[];
  contact: { status: ContactStatus; outgoing: boolean } | null;
  directConversationId: string | null;
}

export function Profile() {
  const { username } = useParams();
  const selfId = useSession((state) => state.user?.id ?? '');
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const presence = usePresenceOf(profile?.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (!username) return;
    setProfile(null);
    setMissing(false);
    api
      .get<ProfileResponse>(`/users/${username}`)
      .then((data) => {
        setProfile(data);
        document.title = pageTitle(data.user.displayName);
      })
      .catch(() => setMissing(true));
  }, [username]);

  if (missing) {
    return (
      <Workspace>
        <EmptyState title="No encontramos a esa persona" description="Revisa el @usuario." />
      </Workspace>
    );
  }

  if (!profile) {
    return (
      <Workspace>
        <Loading />
      </Workspace>
    );
  }

  const isSelf = profile.user.id === selfId;

  const openChat = async () => {
    setBusy(true);
    try {
      let conversationId = profile.directConversationId;
      if (!conversationId) {
        const conversation = await api.post<Conversation>('/conversations/direct', {
          userId: profile.user.id,
        });
        useChat.getState().applyConversation(conversation);
        conversationId = conversation.id;
      }
      navigate(`/mensajes/${conversationId}`);
    } catch (err) {
      toastError(err, 'No se pudo abrir la conversación');
    } finally {
      setBusy(false);
    }
  };

  const addContact = async () => {
    setBusy(true);
    try {
      await api.post('/users/contacts', { userId: profile.user.id });
      setProfile({ ...profile, contact: { status: 'pending', outgoing: true } });
      toastOk('Solicitud enviada');
    } catch (err) {
      toastError(err, 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  const call = async (kind: 'audio' | 'video') => {
    let conversationId = profile.directConversationId;
    if (!conversationId) {
      try {
        const conversation = await api.post<Conversation>('/conversations/direct', {
          userId: profile.user.id,
        });
        conversationId = conversation.id;
        useChat.getState().applyConversation(conversation);
      } catch (err) {
        toastError(err, 'No se pudo iniciar la llamada');
        return;
      }
    }
    void useCalls.getState().start(conversationId, kind, selfId);
  };

  return (
    <Workspace>
      <div className={styles.overview}>
        <div
          className={styles.banner}
          style={
            profile.user.accentColor
              ? {
                  background: `linear-gradient(120deg, ${profile.user.accentColor}22, var(--surface-2))`,
                }
              : undefined
          }
        />
        <div className={styles.overviewInner}>
          <div className={styles.overviewHead}>
            <Avatar user={profile.user} size="xl" presence />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className={styles.overviewTitle}>{profile.user.displayName}</h1>
              <p className={styles.overviewMeta}>
                @{profile.user.username}
                {presence ? ` · ${lastSeenLabel(presence.status, presence.lastSeenAt)}` : ''}
              </p>
              {profile.user.customStatus?.text ? (
                <p className={styles.overviewMeta}>
                  {profile.user.customStatus.emoji ?? ''} {profile.user.customStatus.text}
                </p>
              ) : null}
              {profile.user.activity ? (
                <p className={styles.overviewMeta}>🎮 {profile.user.activity.name}</p>
              ) : null}
            </div>
          </div>

          {profile.user.bio ? <p className={styles.description}>{profile.user.bio}</p> : null}

          {!isSelf ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                icon={<MessageCircle size={16} />}
                onClick={openChat}
                loading={busy}
              >
                Enviar mensaje
              </Button>
              <Button icon={<Phone size={16} />} onClick={() => void call('audio')}>
                Llamar
              </Button>
              <Button icon={<Video size={16} />} onClick={() => void call('video')}>
                Video
              </Button>
              {profile.contact?.status === 'accepted' ? (
                <Button icon={<UserCheck size={16} />} disabled>
                  En tus contactos
                </Button>
              ) : profile.contact?.status === 'pending' ? (
                <Button disabled>Solicitud pendiente</Button>
              ) : (
                <Button icon={<UserPlus size={16} />} onClick={addContact} loading={busy}>
                  Añadir a contactos
                </Button>
              )}
            </div>
          ) : null}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Comunidades</h2>
            {profile.communities.length === 0 ? (
              <EmptyState title="Sin comunidades públicas" />
            ) : (
              <div className={styles.memberGrid}>
                {profile.communities.map((community) => (
                  <button
                    key={community.id}
                    type="button"
                    className={styles.memberCard}
                    onClick={() => navigate(`/comunidades/${community.id}`)}
                  >
                    <span className={styles.rowIcon}>
                      <Users size={16} />
                    </span>
                    <span className={styles.memberText}>
                      <span className={styles.memberName}>{community.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <p className={styles.overviewMeta}>En KYRO desde {fullStamp(profile.user.createdAt)}</p>
        </div>
      </div>
    </Workspace>
  );
}
