import { useEffect } from 'react';
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
import { relative } from '@/lib/format';
import { useNotifications } from '@/store/notifications';
import { toastError } from '@/store/ui';
import { Workspace } from '@/components/layout/AppShell';
import { ContactRequests } from '@/components/contacts/ContactRequests';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
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

export function Activity() {
  const items = useNotifications((state) => state.items);
  const loaded = useNotifications((state) => state.loaded);
  const loading = useNotifications((state) => state.loading);
  const hasMore = useNotifications((state) => state.hasMore);
  const unreadCount = useNotifications((state) => state.unreadCount);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = pageTitle('Actividad');
    void useNotifications.getState().load().catch(() => undefined);
  }, []);

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

  return (
    <Workspace>
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.title}>
            Actividad{unreadCount > 0 ? ` · ${unreadCount} sin leer` : ''}
          </span>
          <Button
            size="sm"
            icon={<CheckCheck size={15} />}
            disabled={unreadCount === 0}
            onClick={() =>
              void useNotifications
                .getState()
                .markRead()
                .catch((err) => toastError(err))
            }
          >
            Marcar todo como leído
          </Button>
        </header>

        <div className={styles.list}>
          <ContactRequests />
          {!loaded ? (
            <SkeletonList rows={6} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Bell size={22} />}
              title="Nada nuevo por ahora"
              description="Aquí llegarán menciones, invitaciones, anuncios, llamadas y encuentros."
            />
          ) : (
            <>
              {items.map((notification) => {
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

              {hasMore ? (
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
