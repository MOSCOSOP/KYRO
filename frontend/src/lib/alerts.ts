/**
 * Avisos de KYRO: sonido y notificaciones del navegador.
 *
 * Los tres sonidos viven en `public/` y se cargan la primera vez que hacen
 * falta, no al arrancar: un aviso que nadie ha pedido todavía no debería
 * costar ancho de banda.
 *
 * Todo pasa por dos filtros antes de molestar: la preferencia del usuario y su
 * estado. En «No molestar» KYRO se calla, que es lo que significa.
 */

/**
 * Un sonido de la aplicación.
 *
 * El navegador puede negarse a reproducir si todavía no ha habido un gesto del
 * usuario en la página. No es un error que haya que contar a nadie: se ignora
 * y el aviso se queda en lo visual.
 */
class Sound {
  private element: HTMLAudioElement | null = null;
  private stopTimer: number | null = null;

  constructor(
    private readonly src: string,
    private readonly volume: number,
  ) {}

  private load() {
    if (!this.element) {
      this.element = new Audio(this.src);
      this.element.preload = 'auto';
      this.element.volume = this.volume;
    }
    return this.element;
  }

  /** Lo reproduce una vez desde el principio, cortando la repetición anterior. */
  play() {
    const audio = this.load();
    audio.loop = false;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  /**
   * Lo repite hasta que se pare. `maxMs` es el seguro: si el otro extremo
   * desaparece sin avisar, el timbre no se queda sonando para siempre.
   */
  loop(maxMs?: number) {
    const audio = this.load();
    if (!audio.paused && audio.loop) return;

    audio.loop = true;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);

    if (maxMs) {
      this.clearTimer();
      this.stopTimer = window.setTimeout(() => this.stop(), maxMs);
    }
  }

  stop() {
    this.clearTimer();
    if (!this.element) return;
    this.element.pause();
    this.element.loop = false;
    this.element.currentTime = 0;
  }

  private clearTimer() {
    if (this.stopTimer === null) return;
    window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }
}

const message = new Sound('/notificacion.mp3', 0.5);
const incoming = new Sound('/recibir.mp3', 0.7);
const outgoing = new Sound('/llamada.mp3', 0.45);

/** Mensaje nuevo, venga de donde venga. */
export function playMessageTone() {
  message.play();
}

/**
 * Llamada entrante. Suena en bucle con un tope de treinta segundos: pasado
 * ese tiempo, quien llama ya ha colgado o la llamada se ha perdido.
 */
export function startRingtone() {
  incoming.loop(30_000);
}

export function stopRingtone() {
  incoming.stop();
}

/** Llamada saliente: el tono que se oye mientras al otro lado suena el timbre. */
export function startRingback() {
  outgoing.loop();
}

export function stopRingback() {
  outgoing.stop();
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
