import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarDays, Volume2 } from 'lucide-react';
import type { CommunityEvent, PublicUser } from '@kyro/shared';
import { api } from '@/lib/api';
import { pageTitle } from '@/config/brand';
import { conversationName, otherMember, previewText } from '@/lib/conversation';
import { eventStamp, greeting, shortStamp } from '@/lib/format';
import { useChat } from '@/store/chat';
import { useCommunities } from '@/store/communities';
import { usePresence } from '@/store/presence';
import { useSession } from '@/store/session';
import { Workspace } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, SkeletonList } from '@/components/ui/Feedback';
import styles from './Home.module.css';

const RING = {
  available: styles.ringAvailable,
  away: styles.ringAway,
  dnd: styles.ringDnd,
  invisible: '',
  offline: '',
} as const;

export function Home() {
  const user = useSession((state) => state.user);
  const conversations = useChat((state) => state.conversations);
  const loaded = useChat((state) => state.conversationsLoaded);
  const communities = useCommunities((state) => state.communities);
  const details = useCommunities((state) => state.details);
  const presence = usePresence((state) => state.byUser);
  const [events, setEvents] = useState<CommunityEvent[]>([]);

  useEffect(() => {
    document.title = pageTitle();
    api
      .get<{ items: CommunityEvent[] }>('/communities/events')
      .then((data) => setEvents(data.items.slice(0, 2)))
      .catch(() => setEvents([]));
  }, []);

  /* Personas con las que hablas, las conectadas primero. */
  const people = useMemo(() => {
    if (!user) return [];
    const seen = new Map<string, { person: PublicUser; conversationId: string; unread: number }>();

    for (const conversation of conversations) {
      if (conversation.type !== 'direct') continue;
      const person = otherMember(conversation, user.id);
      if (!person || seen.has(person.id)) continue;
      seen.set(person.id, {
        person,
        conversationId: conversation.id,
        unread: conversation.unreadCount,
      });
    }

    const rank = (id: string) => {
      const status = presence[id]?.status;
      if (status === 'available') return 0;
      if (status === 'away' || status === 'dnd') return 1;
      return 2;
    };

    return [...seen.values()].sort((a, b) => rank(a.person.id) - rank(b.person.id)).slice(0, 12);
  }, [conversations, presence, user]);

  const threads = conversations.filter((item) => item.type !== 'channel').slice(0, 5);
  const unread = conversations.reduce((total, item) => total + item.unreadCount, 0);

  /* Salas de voz con gente dentro, en las comunidades ya cargadas. */
  const liveRooms = useMemo(
    () =>
      Object.values(details)
        .flatMap((detail) =>
          detail.rooms
            .filter((room) => room.participants.length > 0)
            .map((room) => ({ room, community: detail })),
        )
        .slice(0, 2),
    [details],
  );

  if (!user) return null;

  return (
    <Workspace>
      <div className={styles.page}>
        <div className={styles.inner}>
          <header className={styles.hero}>
            <h1 className={styles.greeting}>{greeting(user.displayName.split(' ')[0])}</h1>
            <p className={styles.subline}>
              {unread > 0 ? (
                <>
                  Tienes <span className={styles.sublineAccent}>{unread}</span>{' '}
                  {unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}.
                </>
              ) : (
                'No hay nada pendiente.'
              )}
            </p>
          </header>

          {people.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Personas</h2>
              </div>
              <div className={styles.people}>
                {people.map(({ person, conversationId, unread: pending }) => {
                  const status = presence[person.id]?.status ?? person.status;
                  return (
                    <Link
                      key={person.id}
                      to={`/mensajes/${conversationId}`}
                      className={styles.person}
                      title={person.displayName}
                    >
                      <span className={styles.personWrap}>
                        <span className={clsx(styles.personRing, RING[status])}>
                          <Avatar user={person} size="lg" />
                        </span>
                        {pending > 0 ? (
                          <span className={styles.personBadge}>
                            <Badge count={pending} />
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.personName}>
                        {person.displayName.split(' ')[0]}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Continuar</h2>
              <Link className={styles.sectionLink} to="/mensajes">
                Todas
              </Link>
            </div>

            {!loaded ? (
              <SkeletonList rows={3} />
            ) : threads.length === 0 ? (
              <p className={styles.quiet}>Las conversaciones nuevas aparecerán aquí.</p>
            ) : (
              <div className={styles.threads}>
                {threads.map((conversation) => (
                  <Link
                    key={conversation.id}
                    to={`/mensajes/${conversation.id}`}
                    className={clsx(styles.thread, conversation.unreadCount > 0 && styles.unread)}
                  >
                    {conversation.type === 'direct' ? (
                      <Avatar user={otherMember(conversation, user.id)} size="md" presence />
                    ) : (
                      <Avatar
                        name={conversationName(conversation, user.id)}
                        src={conversation.avatarUrl}
                        size="md"
                        square
                      />
                    )}
                    <span className={styles.threadBody}>
                      <span className={styles.threadTop}>
                        <span className={styles.threadName}>
                          {conversationName(conversation, user.id)}
                        </span>
                        <span className={styles.threadTime}>
                          {conversation.unreadCount > 0 ? (
                            <Badge count={conversation.unreadCount} />
                          ) : (
                            shortStamp(conversation.lastMessageAt)
                          )}
                        </span>
                      </span>
                      <span className={styles.threadPreview}>
                        {previewText(conversation, user.id)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {liveRooms.length > 0 || events.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Ahora</h2>
              </div>
              <div className={styles.now}>
                {liveRooms.map(({ room, community }) => (
                  <Link
                    key={room.id}
                    to={`/comunidades/${community.id}`}
                    className={styles.nowRow}
                  >
                    <span className={styles.nowIcon}>
                      <Volume2 size={17} />
                    </span>
                    <span className={styles.nowText}>
                      <span className={styles.nowTitle}>{room.name}</span>
                      <span className={styles.nowMeta}>
                        {community.name} · {room.participants.length}{' '}
                        {room.participants.length === 1 ? 'persona' : 'personas'}
                      </span>
                    </span>
                    <span className={styles.live}>
                      <span className={styles.liveDot} />
                      En voz
                    </span>
                  </Link>
                ))}

                {events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/comunidades/${event.communityId}`}
                    className={styles.nowRow}
                  >
                    <span className={styles.nowIcon}>
                      <CalendarDays size={17} />
                    </span>
                    <span className={styles.nowText}>
                      <span className={styles.nowTitle}>{event.title}</span>
                      <span className={styles.nowMeta}>{eventStamp(event.startsAt)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {communities.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Comunidades</h2>
                <Link className={styles.sectionLink} to="/comunidades">
                  Todas
                </Link>
              </div>
              <div className={styles.threads}>
                {communities.slice(0, 3).map((community) => (
                  <Link
                    key={community.id}
                    to={`/comunidades/${community.id}`}
                    className={styles.thread}
                  >
                    <Avatar name={community.name} src={community.iconUrl} size="md" square />
                    <span className={styles.threadBody}>
                      <span className={styles.threadTop}>
                        <span className={styles.threadName}>{community.name}</span>
                      </span>
                      <span className={styles.threadPreview}>
                        {community.memberCount} miembros
                        {community.onlineCount > 0 ? ` · ${community.onlineCount} en línea` : ''}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Workspace>
  );
}
