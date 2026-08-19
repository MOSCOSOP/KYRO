import clsx from 'clsx';
import { brand } from '@/config/brand';
import { KyroMark } from './KyroMark';
import styles from './Logo.module.css';

const MARK_SIZE = { sm: 24, md: 30, lg: 42, xl: 60 } as const;

interface LogoProps {
  size?: keyof typeof MARK_SIZE;
  /** Sin el nombre al lado: el símbolo solo. */
  markOnly?: boolean;
  /** Anima la entrada una vez (pantallas de acceso). */
  animate?: boolean;
  className?: string;
}

/**
 * La marca de KYRO. Aparece poco y siempre igual: el símbolo, y el nombre
 * únicamente donde hace falta presentarse.
 */
export function Logo({ size = 'md', markOnly, animate, className }: LogoProps) {
  return (
    <span
      className={clsx(styles.logo, styles[size], animate && styles.enter, className)}
      aria-label={brand.name}
      role="img"
    >
      <KyroMark size={MARK_SIZE[size]} className={styles.mark} />
      {markOnly ? null : <span className={styles.wordmark}>{brand.name}</span>}
    </span>
  );
}
