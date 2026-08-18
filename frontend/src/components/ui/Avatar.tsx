import clsx from 'clsx';
import type { PresenceStatus, PublicUser } from '@kyro/shared';
import { initials, PRESENCE_LABEL } from '@/lib/format';
import { usePresenceOf } from '@/store/presence';
import styles from './Avatar.module.css';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  user?: PublicUser | null;
  name?: string;
  src?: string | null;
  size?: Size;
  /** Muestra el punto de presencia (solo tiene sentido con `user`). */
  presence?: boolean;
  square?: boolean;
  onBackground?: boolean;
  className?: string;
}

export function Avatar({
  user,
  name,
  src,
  size = 'md',
  presence = false,
  square = false,
  onBackground = false,
  className,
}: AvatarProps) {
  const entry = usePresenceOf(user);
  const label = user?.displayName ?? name ?? '';
  const image = src ?? user?.avatarUrl ?? null;
  const accent = user?.accentColor ?? null;

  return (
    <span className={clsx(styles.wrapper, styles[size], className)}>
      <span
        className={clsx(styles.avatar, square && styles.square)}
        style={accent ? { background: accent, color: '#0d0f13' } : undefined}
        aria-hidden={Boolean(image)}
      >
        {image ? (
          <img className={styles.image} src={image} alt={label} loading="lazy" decoding="async" />
        ) : (
          initials(label)
        )}
      </span>
      {presence && entry ? (
        <PresenceDot status={entry.status} size={size} onBackground={onBackground} />
      ) : null}
    </span>
  );
}

export function PresenceDot({
  status,
  size = 'md',
  onBackground = false,
}: {
  status: PresenceStatus;
  size?: Size;
  onBackground?: boolean;
}) {
  return (
    <span
      className={clsx(styles.dot, styles[size], styles[status], onBackground && styles.dotOnBg)}
      title={PRESENCE_LABEL[status]}
      aria-label={PRESENCE_LABEL[status]}
      role="img"
    />
  );
}
