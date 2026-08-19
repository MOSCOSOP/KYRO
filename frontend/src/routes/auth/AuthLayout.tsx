import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
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
  return (
    <main className={styles.page}>
      <span className={`${styles.aura} ${styles.auraBlue}`} aria-hidden />
      <span className={`${styles.aura} ${styles.auraViolet}`} aria-hidden />
      <span className={styles.grid} aria-hidden />

      <div className={styles.layout}>
        <section className={styles.brandSide}>
          <Logo size="lg" animate />
          <h1 className={styles.statement}>
            {statement[0]} <span className={styles.statementAccent}>{statement[1]}</span>
          </h1>
          <p className={styles.support}>{support}</p>

          <div className={styles.marks}>
            {MARKS.map((mark) => (
              <span key={mark} className={styles.markRow}>
                <span className={styles.markDot} aria-hidden />
                {mark}
              </span>
            ))}
          </div>
        </section>

        <section className={styles.panel}>{children}</section>
      </div>
    </main>
  );
}
