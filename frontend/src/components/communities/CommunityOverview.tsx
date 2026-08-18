import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Check, Hash, Megaphone, UserPlus, Users } from 'lucide-react';
import type { CommunityDetail } from '@kyro/shared';
import { ROLE_LABEL, can } from '@kyro/shared';
import { eventStamp } from '@/lib/format';
import { useCommunities } from '@/store/communities';
import { toastError } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Loading } from '@/components/ui/Feedback';
import { CreateEventModal } from './CreateEventModal';
import { InviteModal } from './InviteModal';
import styles from './Communities.module.css';

/** Portada de la comunidad: de qué va, qué se cuece y quién está. */
export function CommunityOverview({ community }: { community: CommunityDetail }) {
  const members = useCommunities((state) => state.members[community.id]);
  const toggleAttendance = useCommunities((state) => state.toggleAttendance);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void useCommunities.getState().loadMembers(community.id).catch(() => undefined);
  }, [community.id]);

  const role = community.myRole ?? 'member';

  return (
    <div className={styles.overview}>
      <div
        className={styles.banner}
        style={
          community.bannerUrl
            ? { backgroundImage: `url(${community.bannerUrl})`, backgroundSize: 'cover' }
            : community.accentColor
              ? { background: `linear-gradient(120deg, ${community.accentColor}22, var(--surface-2))` }
              : undefined
        }
      />

      <div className={styles.overviewInner}>
        <div className={styles.overviewHead}>
          <Avatar name={community.name} src={community.iconUrl} size="xl" square />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className={styles.overviewTitle}>{community.name}</h1>
            <p className={styles.overviewMeta}>
              {community.memberCount} miembros · {community.channels.length} canales ·{' '}
              {community.isPublic ? 'Pública' : 'Privada'}
            </p>
          </div>
          {can(role, 'member.invite') ? (
            <Button icon={<UserPlus size={16} />} onClick={() => setInviteOpen(true)}>
              Invitar
            </Button>
          ) : null}
        </div>

        {community.description ? (
          <p className={styles.description}>{community.description}</p>
        ) : null}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Canales</h2>
          <div className={styles.memberGrid}>
            {community.channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                className={styles.memberCard}
                onClick={() => navigate(`/comunidades/${community.id}/${channel.id}`)}
              >
                <span className={styles.rowIcon}>
                  {channel.channelKind === 'announcement' ? (
                    <Megaphone size={16} />
                  ) : (
                    <Hash size={16} />
                  )}
                </span>
                <span className={styles.memberText}>
                  <span className={styles.memberName}>{channel.name}</span>
                  {channel.topic ? (
                    <span className={styles.memberRole}>{channel.topic}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Encuentros</h2>
          {community.events.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={20} />}
              title="Nada programado"
              description="Cuando haya un encuentro aparecerá aquí."
              action={
                can(role, 'event.create') ? (
                  <Button size="sm" onClick={() => setEventOpen(true)}>
                    Crear encuentro
                  </Button>
                ) : undefined
              }
            />
          ) : (
            community.events.map((event) => (
              <div key={event.id} className={styles.eventCard}>
                <span className={styles.rowIcon}>
                  <CalendarDays size={17} />
                </span>
                <span className={styles.eventText}>
                  <span className={styles.eventTitle}>{event.title}</span>
                  <span className={styles.eventMeta}>
                    {eventStamp(event.startsAt)} · {event.attendeeCount} apuntados
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={event.attending ? 'subtle' : 'secondary'}
                  icon={event.attending ? <Check size={14} /> : undefined}
                  onClick={() =>
                    void toggleAttendance(community.id, event.id).catch((err) => toastError(err))
                  }
                >
                  {event.attending ? 'Voy' : 'Me apunto'}
                </Button>
              </div>
            ))
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Users size={16} style={{ display: 'inline', verticalAlign: '-2px' }} /> Miembros
          </h2>
          {!members ? (
            <Loading />
          ) : (
            <div className={styles.memberGrid}>
              {members.slice(0, 24).map((member) => (
                <button
                  key={member.user.id}
                  type="button"
                  className={styles.memberCard}
                  onClick={() => navigate(`/u/${member.user.username}`)}
                >
                  <Avatar user={member.user} size="sm" presence />
                  <span className={styles.memberText}>
                    <span className={styles.memberName}>{member.user.displayName}</span>
                    <span className={styles.memberRole}>{ROLE_LABEL[member.role]}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <InviteModal community={community} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <CreateEventModal community={community} open={eventOpen} onClose={() => setEventOpen(false)} />
    </div>
  );
}
