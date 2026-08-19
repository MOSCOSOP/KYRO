/**
 * Avisos de KYRO: sonido y notificaciones del navegador.
 *
 * Los tonos se sintetizan con WebAudio en lugar de cargar archivos: son dos
 * notas limpias, pesan cero y no hay que esperar a que descargue nada para que
 * suene el primer aviso.
 *
 * Todo pasa por dos filtros antes de molestar: la preferencia del usuario y su
 * estado. En «No molestar» KYRO se calla, que es lo que significa.
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context || context.state === 'closed') context = new Ctor();
  // Los navegadores suspenden el audio hasta que hay un gesto del usuario.
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

/** Una nota corta con entrada y salida suaves: nunca un chasquido. */
function tone(frequency: number, start: number, duration: number, volume = 0.05) {
  const ctx = audio();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  const at = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.05);
}

/** Mensaje nuevo: dos notas ascendentes, muy breves. */
export function playMessageTone() {
  tone(660, 0, 0.12);
  tone(880, 0.09, 0.16);
}

let ringTimer: number | null = null;

/** Llamada entrante: patrón que se repite hasta que se contesta o se cuelga. */
export function startRingtone() {
  if (ringTimer !== null) return;

  const ring = () => {
    tone(523, 0, 0.35, 0.06);
    tone(659, 0.18, 0.4, 0.06);
  };

  ring();
  ringTimer = window.setInterval(ring, 2400);
}

export function stopRingtone() {
  if (ringTimer === null) return;
  window.clearInterval(ringTimer);
  ringTimer = null;
}

/* --------------------------- Avisos del navegador -------------------------- */

export function systemNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function systemPermission(): NotificationPermission | 'unsupported' {
  if (!systemNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestSystemPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!systemNotificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Muestra un aviso del sistema. Solo tiene sentido con la pestaña en segundo
 * plano: si KYRO está delante, el propio mensaje ya se ve.
 */
export function showSystemNotification(input: {
  title: string;
  body?: string;
  tag?: string;
  onClick?: () => void;
}) {
  if (!systemNotificationsSupported() || Notification.permission !== 'granted') return;
  if (!document.hidden) return;

  try {
    const notification = new Notification(input.title, {
      body: input.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Con la misma etiqueta, un aviso sustituye al anterior en vez de apilarse.
      tag: input.tag,
      silent: true,
    });

    notification.onclick = () => {
      window.focus();
      input.onClick?.();
      notification.close();
    };
  } catch {
    // Algunos navegadores solo permiten avisos desde el service worker.
  }
}
