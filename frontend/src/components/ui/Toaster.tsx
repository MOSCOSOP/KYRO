import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useUI } from '@/store/ui';
import { IconButton } from './Button';
import styles from './Toaster.module.css';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

export function Toaster() {
  const toasts = useUI((state) => state.toasts);
  const dismiss = useUI((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.stack} role="region" aria-label="Avisos">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            className={clsx(styles.toast, styles[toast.kind])}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <span className={styles.icon}>
              <Icon size={17} />
            </span>
            <div className={styles.content}>
              <span className={styles.title}>{toast.title}</span>
              {toast.description ? (
                <span className={styles.description}>{toast.description}</span>
              ) : null}
            </div>
            <IconButton label="Descartar" size="sm" onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
