/**
 * Registro técnico de WebRTC.
 *
 * Activo en desarrollo y, en producción, solo si se pide explícitamente con
 * `localStorage.setItem('kyro:debug-rtc', '1')`. Así se puede diagnosticar una
 * llamada real sin ensuciar la consola de todos los usuarios.
 */
function enabled() {
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem('kyro:debug-rtc') === '1';
  } catch {
    return false;
  }
}

export function rtcLog(message: string, detail?: unknown) {
  if (!enabled()) return;
  if (detail === undefined) console.debug(`[WebRTC] ${message}`);
  else console.debug(`[WebRTC] ${message}`, detail);
}

export function rtcWarn(message: string, detail?: unknown) {
  if (!enabled()) return;
  if (detail === undefined) console.warn(`[WebRTC] ${message}`);
  else console.warn(`[WebRTC] ${message}`, detail);
}
