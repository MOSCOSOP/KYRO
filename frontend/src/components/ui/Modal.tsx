import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { IconButton } from './Button';
import { usePresence } from '@/hooks/usePresence';
import { dur } from '@/lib/motion';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Oculta la X (para diálogos que exigen una decisión). */
  hideClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
  hideClose,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const { mounted, phase, onExitComplete } = usePresence(open);

  // El bloqueo de scroll dura lo que el modal está en pantalla, salida incluida.
  useEffect(() => {
    if (!mounted) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab') return;

      // Ciclo de foco dentro del diálogo.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, button:not([aria-label="Cerrar"])',
      );
      target?.focus();
    }, 30);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open, onClose]);

  // Entra con el filo y el fondo a la vez; sale un poco más rápido, sin
  // esperar a que el backdrop termine de irse.
  useGSAP(
    () => {
      if (!mounted) return;
      const backdrop = backdropRef.current;
      const panel = panelRef.current;
      if (!backdrop || !panel) return;

      if (phase === 'enter') {
        gsap.set(backdrop, { opacity: 0 });
        gsap.set(panel, { opacity: 0, y: 10, scale: 0.97 });
        gsap.to(backdrop, { opacity: 1, duration: dur('normal') });
        gsap.to(panel, { opacity: 1, y: 0, scale: 1, duration: dur('normal') });
      } else {
        const tl = gsap.timeline({ onComplete: onExitComplete });
        tl.to(panel, { opacity: 0, y: 8, scale: 0.97, duration: dur('fast') }, 0);
        tl.to(backdrop, { opacity: 0, duration: dur('fast') }, 0);
      }
    },
    { dependencies: [phase, mounted], scope: backdropRef },
  );

  if (!mounted) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={clsx(styles.panel, wide && styles.wide)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.header}>
          <div className={styles.titles}>
            <h2 className={styles.title}>{title}</h2>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {hideClose ? null : (
            <IconButton label="Cerrar" size="sm" onClick={onClose}>
              <X size={16} />
            </IconButton>
          )}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
