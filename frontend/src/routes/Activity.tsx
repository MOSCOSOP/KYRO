import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AtSign,
  Bell,
  CalendarDays,
  CheckCheck,
  Gamepad2,
  Megaphone,
  MessageCircle,
  Phone,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { AppNotification, NotificationType } from '@kyro/shared';
import { pageTitle } from '@/config/brand';
import { dayLabel, relative } from '@/lib/format';
import { useNotifications } from '@/store/notifications';
import { toastError } from '@/store/ui';
import { Workspace } from '@/components/layout/AppShell';
import { ContactRequests } from '@/components/contacts/ContactRequests';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import styles from './Activity.module.css';

const ICONS: Record<NotificationType, typeof Bell> = {
  message: MessageCircle,
  mention: AtSign,
  invite: UserPlus,
  contact_request: UserPlus,
  announcement: Megaphone,
  call: Phone,
  event: CalendarDays,
  activity: Gamepad2,
};

type Filter = 'todo' | 'sin-leer';

export function Activity() {
  const items = useNotifications((state) => state.items);
  const loaded = useNotifications((state) => state.loaded);
  const loading = useNotifications((state) => state.loading);
  const hasMore = useNotifications((state) => state.hasMore);
  const unreadCount = useNotifications((state) => state.unreadCount);
  const [filter, setFilter] = useState<Filter>('todo');
  const navigate = useNavigate();

  useEffect(() => {
    document.title = pageTitle('Actividad');
    void useNotifications.getState().load().catch(() => undefined);
  }, []);

  /* Agrupadas por día: la actividad se lee por cuándo pasó, no en una lista larga. */
  const groups = useMemo(() => {
    const visible = filter === 'sin-leer' ? items.filter((item) => !item.readAt) : items;
    const byDay = new Map<string, AppNotification[]>();

    for (const notification of visible) {
      const key = dayLabel(notification.createdAt);
      const list = byDay.get(key);
      if (list) list.push(notification);
      else byDay.set(key, [notification]);
    }

    return [...byDay.entries()];
  }, [items, filter]);

  const open = (notification: AppNotification) => {
    if (!notification.readAt) {
      void useNotifications.getState().markRead([notification.id]).catch(() => undefined);
    }
    const data = notification.data ?? {};
    if (data.conversationId) navigate(`/mensajes/${data.conversationId}`);
    else if (data.communityId) {
      navigate(
        data.channelId
          ? `/comunidades/${data.communityId}/${data.channelId}`
          : `/comunidades/${data.communityId}`,
      );
    } else if (data.username) navigate(`/u/${data.username}`);
  };

  const empty = groups.length === 0;

  return (
    <Workspace>
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.title}>Actividad</span>

          <span className={styles.headerActions}>
            <Segmented
              label="Filtrar actividad"
              value={filter}
              options={[
                { value: 'todo', label: 'Todo' },
                { value: 'sin-leer', label: `Sin leer${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
              ]}
              onChange={setFilter}
            />

            <IconButton
              label="Marcar todo como leído"
              disabled={unreadCount === 0}
              onClick={() =>
                void useNotifications
                  .getState()
                  .markRead()
                  .catch((err) => toastError(err))
              }
            >
              <CheckCheck size={17} />
            </IconButton>

            <IconButton
              label="Limpiar lo leído"
              disabled={items.every((item) => !item.readAt)}
              onClick={() =>
                void useNotifications
                  .getState()
                  .clearRead()
                  .catch((err) => toastError(err, 'No se pudo limpiar'))
              }
            >
              <Trash2 size={17} />
            </IconButton>
          </span>
        </header>

        <div className={styles.list}>
          <ContactRequests />

          {!loaded ? (
            <SkeletonList rows={6} />
          ) : empty ? (
            <EmptyState
              icon={<Bell size={22} />}
              title={filter === 'sin-leer' ? 'Nada sin leer' : 'Todo tranquilo'}
              description={
                filter === 'sin-leer'
                  ? 'Estás al día.'
                  : 'Aquí aparecen menciones, invitaciones, anuncios, llamadas y encuentros.'
              }
            />
          ) : (
            <>
              {groups.map(([day, notifications]) => (
                <Fragment key={day}>
                  <div className={styles.dayLabel}>{day}</div>

                  {notifications.map((notification) => {
                    const Icon = ICONS[notification.type] ?? Bell;
                    return (
                      <div
                        key={notification.id}
                        className={clsx(styles.item, !notification.readAt && styles.unread)}
                      >
                        {notification.actor ? (
                          <Avatar user={notification.actor} size="md" />
                        ) : (
                          <span className={styles.icon}>
                            <Icon size={17} />
                          </span>
                        )}

                        <div
                          className={styles.body}
                          role="button"
                          tabIndex={0}
                          onClick={() => open(notification)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') open(notification);
                          }}
                        >
                          <span className={styles.itemTitle}>{notification.title}</span>
                          {notification.body ? (
                            <span className={styles.itemBody}>{notification.body}</span>
                          ) : null}
                        </div>

                        <span className={styles.stamp}>{relative(notification.createdAt)}</span>
                        <IconButton
                          label="Descartar"
                          size="sm"
                          onClick={() =>
                            void useNotifications
                              .getState()
                              .remove(notification.id)
                              .catch((err) => toastError(err))
                          }
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    );
                  })}
                </Fragment>
              ))}

              {hasMore && filter === 'todo' ? (
                <div className={styles.more}>
                  <Button
                    loading={loading}
                    onClick={() =>
                      void useNotifications
                        .getState()
                        .loadMore()
                        .catch((err) => toastError(err))
                    }
                  >
                    Ver más
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Workspace>
  );
}
