import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { dur, EASE_POP, prefersReducedMotion } from '@/lib/motion';
import styles from './Menu.module.css';

export interface MenuAnchor {
  x: number;
  y: number;
  /** Alinea el menú a la derecha del punto (útil en menús de "···"). */
  align?: 'start' | 'end';
}

interface MenuProps {
  anchor: MenuAnchor;
  /** Falso mientras se cierra: sigue montado para poder salir con una animación. */
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}

export function Menu({ anchor, open = true, onClose, children, label = 'Menú' }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 8;
    let left = anchor.align === 'end' ? anchor.x - rect.width : anchor.x;
    let top = anchor.y;

    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (left < margin) left = margin;
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.y - rect.height);
    }
    setPosition({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  // Aparece creciendo desde el punto de anclaje; al cerrarse se encoge un poco
  // más rápido de lo que tarda en abrirse, porque salir debe sentirse ligero.
  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;
      if (open) {
        gsap.set(element, { opacity: 0, scale: 0.94 });
        gsap.to(element, { opacity: 1, scale: 1, duration: dur('fast'), ease: EASE_POP });
      } else {
        gsap.to(element, { opacity: 0, scale: 0.96, duration: prefersReducedMotion() ? 0.001 : 0.1 });
      }
    },
    { dependencies: [open], scope: ref },
  );

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label={label}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({
  children,
  icon,
  onSelect,
  danger,
  disabled,
  shortcut,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={clsx(styles.item, danger && styles.danger)}
      onClick={onSelect}
    >
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span className={styles.label}>{children}</span>
      {shortcut ? <span className={styles.shortcut}>{shortcut}</span> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div className={styles.separator} role="separator" />;
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className={styles.heading}>{children}</div>;
}

/**
 * Estado de apertura de un menú contextual o desplegable. Al cerrar, el
 * anclaje se mantiene un instante más: es lo que le da tiempo a `<Menu>` para
 * encogerse en vez de desaparecer de golpe.
 */
export function useMenu() {
  const [state, setState] = useState<{ anchor: MenuAnchor; open: boolean } | null>(null);
  const removeTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(removeTimer.current), []);

  const show = useCallback((anchor: MenuAnchor) => {
    window.clearTimeout(removeTimer.current);
    setState({ anchor, open: true });
  }, []);

  const openAt = useCallback(
    (event: { clientX: number; clientY: number; preventDefault: () => void }) => {
      event.preventDefault();
      show({ x: event.clientX, y: event.clientY });
    },
    [show],
  );

  const openFrom = useCallback(
    (element: HTMLElement | null, align: 'start' | 'end' = 'end') => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      show({ x: align === 'end' ? rect.right : rect.left, y: rect.bottom + 6, align });
    },
    [show],
  );

  const close = useCallback(() => {
    setState((current) => (current ? { ...current, open: false } : null));
    removeTimer.current = window.setTimeout(
      () => setState(null),
      prefersReducedMotion() ? 0 : 150,
    );
  }, []);

  return { anchor: state?.anchor ?? null, open: state?.open ?? false, openAt, openFrom, close };
}
