import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { WifiOff } from 'lucide-react';
import { onConnectionState, type ConnectionState } from '@/lib/socket';
import styles from './ConnectionBanner.module.css';

/**
 * Aviso honesto de conexión: si el tiempo real se cae, el usuario lo sabe
 * en lugar de creer que la aplicación funciona con normalidad.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<ConnectionState>('idle');
  const [visible, setVisible] = useState(false);

  useEffect(() => onConnectionState(setState), []);

  useEffect(() => {
    if (state === 'connected' || state === 'idle') {
      setVisible(false);
      return;
    }
    // Un parpadeo de reconexión no merece un aviso: se espera un poco.
    const timer = window.setTimeout(() => setVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!visible) return null;

  return (
    <div className={clsx(styles.banner, state === 'offline' && styles.offline)} role="status">
      {state === 'offline' ? <WifiOff size={14} /> : <span className={styles.spinner} />}
      <span>
        {state === 'offline' ? 'Sin conexión con KYRO' : 'Reconectando…'}
      </span>
    </div>
  );
}
