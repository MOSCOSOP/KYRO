import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Logo } from '@/components/brand/Logo';
import { KyroMark } from '@/components/brand/KyroMark';
import { dur } from '@/lib/motion';
import styles from './Auth.module.css';

interface AuthLayoutProps {
  /** Frase corta del lado izquierdo. La segunda mitad va con el color de marca. */
  statement: [string, string];
  support: string;
  children: ReactNode;
}

const MARKS = [
  'Mensajes, llamadas y pantalla compartida en el mismo sitio.',
  'De una conversación a una comunidad sin perder el hilo.',
  'Cifrado en tránsito y sesiones que puedes revocar.',
];

/**
 * Marco de las pantallas de acceso: ambiente a la izquierda, formulario a la
 * derecha. En pantallas estrechas se apila y la marca se reduce a lo esencial.
 */
export function AuthLayout({ statement, support, children }: AuthLayoutProps) {
  const brandRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Un solo gesto de entrada: la marca y el panel se mueven juntos, el panel
  // con un instante de retraso, en vez de dos animaciones de CSS sueltas que
  // solo coinciden por casualidad de temporización.
  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { duration: dur('slow') } });
    tl.from(brandRef.current, { opacity: 0, y: 14 }, 0);
    tl.from(panelRef.current, { opacity: 0, y: 14, scale: 0.99 }, 0.08);
  });

  return (
    <main className={styles.page}>
      <span className={`${styles.aura} ${styles.auraBlue}`} aria-hidden />
      <span className={`${styles.aura} ${styles.auraViolet}`} aria-hidden />
      <span className={styles.grid} aria-hidden />

      <div className={styles.layout}>
        <section ref={brandRef} className={styles.brandSide}>
          <KyroMark size={340} className={styles.watermark} />

          <Logo size="lg" animate />
          <h1 className={styles.statement}>
            {statement[0]} <span className={styles.statementAccent}>{statement[1]}</span>
          </h1>
          <p className={styles.support}>{support}</p>

          <div className={styles.marks}>
            {MARKS.map((mark) => (
              <span key={mark} className={styles.markChip}>
                <span className={styles.markDot} aria-hidden />
                {mark}
              </span>
            ))}
          </div>
        </section>

        <section ref={panelRef} className={styles.panel}>
          {children}
        </section>
      </div>
    </main>
  );
}
