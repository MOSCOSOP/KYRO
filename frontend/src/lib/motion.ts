/**
 * KYRO · motion.
 *
 * GSAP entra solo donde CSS no llega: coreografías con varios elementos,
 * entradas y salidas coordinadas, o algo que depende de medir el DOM. Las
 * duraciones y curvas son las mismas que en `tokens.css` — un solo lenguaje de
 * movimiento, escrito en dos sitios porque CSS y GSAP no comparten variables.
 */
import { gsap } from 'gsap';

export const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const EASE_POP = 'cubic-bezier(0.34, 1.4, 0.64, 1)';

export const DURATION = {
  fast: 0.13,
  normal: 0.2,
  slow: 0.34,
} as const;

/** Respeta tanto la preferencia del sistema como el ajuste propio de KYRO. */
export function prefersReducedMotion() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.reducedMotion === 'true') return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Duración real a usar: casi cero con el movimiento reducido, sin ramas condicionales en cada sitio. */
export function dur(key: keyof typeof DURATION) {
  return prefersReducedMotion() ? 0.001 : DURATION[key];
}

gsap.defaults({ ease: EASE });
