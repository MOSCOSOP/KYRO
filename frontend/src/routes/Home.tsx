import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Hash, MessageCircle, Sparkles, Users } from 'lucide-react';
import type { CommunityEvent } from '@kyro/shared';
import { api } from '@/lib/api';
import { brand, pageTitle } from '@/config/brand';
import { conversationName, previewText } from '@/lib/conversation';
import { eventStamp, greeting, shortStamp } from '@/lib/format';
import { useChat } from '@/store/chat';
import { useCommunities } from '@/store/communities';
import { useNotifications } from '@/store/notifications';
import { useSession } from '@/store/session';
import { Workspace } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, EmptyState, SkeletonList } from '@/components/ui/Feedback';
import styles from './Home.module.css';

export function Home() {
  const user = useSession((state) => state.user);
  const conversations = useChat((state) => state.conversations);
  const loaded = useChat((state) => state.conversationsLoaded);
  const communities = useCommunities((state) => state.communities);
  const notifications = useNotifications((state) => state.items);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = pageTitle();
    void useNotifications.getState().load().catch(() => undefined);
    api
      .get<{ items: CommunityEvent[] }>('/communities/events')
      .then((data) => setEvents(data.items.slice(0, 3)))
      .catch(() => setEvents([]));
  }, []);

  if (!user) return null;

  const recent = conversations.slice(0, 6);
  const unread = conversations.reduce((total, item) => total + item.unreadCount, 0);

  return (
    <Workspace>
      <div className={styles.page}>
        <div className={styles.inner}>
          <header className={styles.hero}>
            <h1 className={styles.greeting}>{greeting(user.displayName.split(' ')[0])}</h1>
            <p className={styles.subline}>
              {unread > 0
                ? `Tienes ${unread} ${unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}.`
                : brand.idea}
            </p>
          </header>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Sigue la conversación</h2>
              <Link className={styles.sectionLink} to="/mensajes">
                Ver todo
              </Link>
            </div>

            {!loaded ? (
              <SkeletonList rows={3} />
            ) : recent.length === 0 ? (
              <EmptyState
                icon={<MessageCircle size={20} />}
                title="Aún no tienes conversaciones"
                description="Busca a alguien y empieza a hablar; es tan simple como eso."
              />
            ) : (
              <div className={styles.cards}>
                {recent.map((conversation) => (
                  <Link
                    key={conversation.id}
                    className={styles.card}
                    to={`/mensajes/${conversation.id}`}
                  >
                    {conversation.type === 'direct' ? (
                      <Avatar
                        user={conversation.members.find((member) => member.id !== user.id)}
                        size="md"
                        presence
                      />
                    ) : (
                      <Avatar
                        name={conversationName(conversation, user.id)}
                        src={conversation.avatarUrl}
                        size="md"
                        square
                      />
                    )}
                    <span className={styles.cardText}>
                      <span className={styles.cardTitle}>
                        {conversationName(conversation, user.id)}
                      </span>
                      <span className={styles.cardMeta}>
                        {previewText(conversation, user.id)}
                      </span>
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <Badge count={conversation.unreadCount} />
                    ) : (
                      <span className={styles.cardMeta}>
                        {shortStamp(conversation.lastMessageAt)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {events.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Próximos encuentros</h2>
              </div>
              <div className={styles.rows}>
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={styles.row}
                    onClick={() => navigate(`/comunidades/${event.communityId}`)}
                  >
                    <span className={styles.rowIcon}>
                      <CalendarDays size={17} />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{event.title}</span>
                      <span className={styles.rowMeta}>
                        {eventStamp(event.startsAt)} · {event.attendeeCount} asistentes
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Actividad reciente</h2>
              <Link className={styles.sectionLink} to="/actividad">
                Ver todo
              </Link>
            </div>
            {notifications.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={20} />}
                title="Todo tranquilo"
                description="Aquí aparecerán menciones, invitaciones y anuncios."
              />
            ) : (
              <div className={styles.rows}>
                {notifications.slice(0, 4).map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={styles.row}
                    onClick={() => navigate('/actividad')}
                  >
                    {notification.actor ? (
                      <Avatar user={notification.actor} size="sm" />
                    ) : (
                      <span className={styles.rowIcon}>
                        <Hash size={16} />
                      </span>
                    )}
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{notification.title}</span>
                      <span className={styles.rowMeta}>
                        {notification.body ?? shortStamp(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {communities.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Tus comunidades</h2>
                <Link className={styles.sectionLink} to="/comunidades">
                  Ver todo
                </Link>
              </div>
              <div className={styles.communities}>
                {communities.map((community) => (
                  <Link
                    key={community.id}
                    className={styles.community}
                    to={`/comunidades/${community.id}`}
                  >
                    <Users size={14} />
                    {community.name}
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
