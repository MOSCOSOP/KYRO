import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { dur, EASE } from '@/lib/motion';
import { useUI, type Toast } from '@/store/ui';
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
  // Un aviso descartado sigue montado hasta que su salida termina: el estado
  // vive aquí porque el store ya lo ha olvidado en cuanto deja de "estar".
  const [display, setDisplay] = useState<Toast[]>(toasts);

  useEffect(() => {
    setDisplay((current) => {
      const known = new Map(current.map((toast) => [toast.id, toast]));
      for (const toast of toasts) known.set(toast.id, toast);
      return Array.from(known.values());
    });
  }, [toasts]);

  if (display.length === 0) return null;

  return (
    <div className={styles.stack} role="region" aria-label="Avisos">
      {display.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          present={toasts.some((item) => item.id === toast.id)}
          onDismiss={() => dismiss(toast.id)}
          onExited={() => setDisplay((current) => current.filter((item) => item.id !== toast.id))}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  present,
  onDismiss,
  onExited,
}: {
  toast: Toast;
  present: boolean;
  onDismiss: () => void;
  onExited: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const Icon = ICONS[toast.kind];

  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;
      if (present) {
        gsap.set(element, { opacity: 0, y: 10, scale: 0.98 });
        gsap.to(element, { opacity: 1, y: 0, scale: 1, duration: dur('normal'), ease: EASE });
      } else {
        gsap.to(element, {
          opacity: 0,
          x: 24,
          duration: dur('fast'),
          ease: EASE,
          onComplete: onExited,
        });
      }
    },
    { dependencies: [present], scope: ref },
  );

  return (
    <div className={clsx(styles.toast, styles[toast.kind])} ref={ref} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span className={styles.icon}>
        <Icon size={17} />
      </span>
      <div className={styles.content}>
        <span className={styles.title}>{toast.title}</span>
        {toast.description ? <span className={styles.description}>{toast.description}</span> : null}
      </div>
      <IconButton label="Descartar" size="sm" onClick={onDismiss}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
