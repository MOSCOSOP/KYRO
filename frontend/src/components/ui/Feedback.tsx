import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import styles from './Feedback.module.css';

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Cargando"
    />
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className={styles.centered}>
      <Spinner />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Skeleton({
  width,
  height = 12,
  radius,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}) {
  const style: CSSProperties = { width, height };
  if (radius !== undefined) style.borderRadius = radius;
  return <span className={clsx(styles.skeleton, className)} style={style} aria-hidden />;
}

/** Esqueleto de una fila de lista (avatar + dos líneas). */
export function SkeletonRow() {
  return (
    <div className={styles.skeletonRow} aria-hidden>
      <Skeleton width={38} height={38} radius={999} />
      <span className={styles.skeletonLines}>
        <Skeleton width="45%" height={11} />
        <Skeleton width="75%" height={10} />
      </span>
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon ? <span className={styles.emptyIcon}>{icon}</span> : null}
      <span className={styles.emptyTitle}>{title}</span>
      {description ? <p className={styles.emptyText}>{description}</p> : null}
      {action}
    </div>
  );
}

export function Badge({ count, muted }: { count: number; muted?: boolean }) {
  if (count <= 0) return null;
  return (
    <span className={clsx(styles.badge, muted && styles.badgeMuted)}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Dot() {
  return <span className={clsx(styles.badge, styles.dot)} aria-hidden />;
}
