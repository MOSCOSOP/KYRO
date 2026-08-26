import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Phone, Settings, UserCheck, UserPlus, Users, Video, X } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { ContactStatus, Conversation, PublicUser } from '@kyro/shared';
import { api } from '@/lib/api';
import { fullStamp, presenceLine } from '@/lib/format';
import { dur } from '@/lib/motion';
import { useCalls } from '@/store/calls';
import { useChat } from '@/store/chat';
import { usePresenceOf } from '@/store/presence';
import { useSession } from '@/store/session';
import { toastError, toastOk, useUI } from '@/store/ui';
import { usePresence } from '@/hooks/usePresence';
import { useIsCompact } from '@/hooks/useMediaQuery';
import { Avatar, PresenceDot } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Feedback';
import styles from './ProfilePanel.module.css';

interface ProfileResponse {
  user: PublicUser;
  communities: { id: string; name: string; iconUrl: string | null; slug: string }[];
  contact: { status: ContactStatus; outgoing: boolean } | null;
  directConversationId: string | null;
}

/**
 * Perfil de una persona sin salir de donde estabas. Se abre desde cualquier
 * sitio donde aparezca alguien: un mensaje, la paleta, la lista de miembros.
 */
export function ProfilePanel() {
  const username = useUI((state) => state.profileUsername);
  const close = useUI((state) => state.closeProfile);
  const selfId = useSession((state) => state.user?.id ?? '');
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const presence = usePresenceOf(profile?.user);
  const navigate = useNavigate();
  const compact = useIsCompact();
  const { mounted, phase, onExitComplete } = usePresence(Boolean(username));
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!username) return;
    setProfile(null);
    setError(false);
    let cancelled = false;
    api
      .get<ProfileResponse>(`/users/${username}`)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mounted, close]);

  // El perfil llega por el lado en escritorio y sube desde abajo en móvil; la
  // salida es más rápida que la entrada, para que cerrar se sienta ligero.
  useGSAP(
    () => {
      if (!mounted) return;
      const backdrop = backdropRef.current;
      const panel = panelRef.current;
      if (!backdrop || !panel) return;
      const offset = compact ? { y: 24 } : { x: 24 };

      if (phase === 'enter') {
        gsap.set(backdrop, { opacity: 0 });
        gsap.set(panel, { opacity: 0, ...offset });
        gsap.to(backdrop, { opacity: 1, duration: dur('fast') });
        gsap.to(panel, { opacity: 1, x: 0, y: 0, duration: dur('normal') });
      } else {
        const tl = gsap.timeline({ onComplete: onExitComplete });
        tl.to(panel, { opacity: 0, ...offset, duration: dur('fast') }, 0);
        tl.to(backdrop, { opacity: 0, duration: dur('fast') }, 0);
      }
    },
    { dependencies: [phase, mounted, compact], scope: backdropRef },
  );

  if (!mounted) return null;

  const isSelf = profile?.user.id === selfId;

  /** Abre (o crea) la conversación directa con esta persona. */
  const ensureConversation = async () => {
    if (!profile) return null;
    if (profile.directConversationId) return profile.directConversationId;
    const conversation = await api.post<Conversation>('/conversations/direct', {
      userId: profile.user.id,
    });
    useChat.getState().applyConversation(conversation);
    return conversation.id;
  };

  const openChat = async () => {
    setBusy(true);
    try {
      const id = await ensureConversation();
      if (id) {
        close();
        navigate(`/mensajes/${id}`);
      }
    } catch (err) {
      toastError(err, 'No se pudo abrir la conversación');
    } finally {
      setBusy(false);
    }
  };

  const call = async (kind: 'audio' | 'video') => {
    setBusy(true);
    try {
      const id = await ensureConversation();
      if (id) {
        close();
        void useCalls.getState().start(id, kind, selfId);
      }
    } catch (err) {
      toastError(err, 'No se pudo iniciar la llamada');
    } finally {
      setBusy(false);
    }
  };

  const addContact = async () => {
    if (!profile) return;
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

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="Perfil">
        <IconButton label="Cerrar" className={styles.close} onClick={close}>
          <X size={16} />
        </IconButton>

        {error ? (
          <div className={styles.section} style={{ paddingTop: 'var(--space-10)' }}>
            <p className={styles.bio}>No encontramos a esa persona.</p>
          </div>
        ) : !profile ? (
          <Loading />
        ) : (
          <>
            <div className={styles.cover} />

            <div className={styles.head}>
              <span className={styles.avatarRing}>
                <Avatar user={profile.user} size="xl" presence onBackground />
              </span>
              <div>
                <div className={styles.name}>{profile.user.displayName}</div>
                <div className={styles.handle}>@{profile.user.username}</div>
              </div>
              {presence ? (
                <span className={styles.presence}>
                  <PresenceDot status={presence.status} size="sm" />
                  {presenceLine(presence)}
                </span>
              ) : null}
            </div>

            {profile.user.bio ? <p className={styles.bio}>{profile.user.bio}</p> : null}

            <div className={styles.actions}>
              {isSelf ? (
                <Button
                  block
                  icon={<Settings size={16} />}
                  onClick={() => {
                    close();
                    navigate('/ajustes');
                  }}
                >
                  Editar perfil
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    icon={<MessageCircle size={16} />}
                    onClick={openChat}
                    loading={busy}
                  >
                    Mensaje
                  </Button>
                  <IconButton label="Llamar" size="lg" onClick={() => void call('audio')}>
                    <Phone size={17} />
                  </IconButton>
                  <IconButton label="Videollamada" size="lg" onClick={() => void call('video')}>
                    <Video size={17} />
                  </IconButton>
                </>
              )}
            </div>

            {!isSelf ? (
              <div className={styles.section}>
                {profile.contact?.status === 'accepted' ? (
                  <span className={styles.row}>
                    <span className={styles.rowIcon}>
                      <UserCheck size={15} />
                    </span>
                    En tus contactos
                  </span>
                ) : profile.contact?.status === 'pending' ? (
                  <span className={styles.row}>
                    <span className={styles.rowIcon}>
                      <UserPlus size={15} />
                    </span>
                    Solicitud pendiente
                  </span>
                ) : (
                  <button type="button" className={styles.row} onClick={addContact} disabled={busy}>
                    <span className={styles.rowIcon}>
                      <UserPlus size={15} />
                    </span>
                    Añadir a contactos
                  </button>
                )}
              </div>
            ) : null}

            {profile.communities.length > 0 ? (
              <div className={styles.section}>
                <span className={styles.sectionTitle}>Comunidades</span>
                {profile.communities.map((community) => (
                  <button
                    key={community.id}
                    type="button"
                    className={styles.row}
                    onClick={() => {
                      close();
                      navigate(`/comunidades/${community.id}`);
                    }}
                  >
                    <span className={styles.rowIcon}>
                      <Users size={15} />
                    </span>
                    {community.name}
                  </button>
                ))}
              </div>
            ) : null}

            <p className={styles.meta}>En KYRO desde {fullStamp(profile.user.createdAt)}</p>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
