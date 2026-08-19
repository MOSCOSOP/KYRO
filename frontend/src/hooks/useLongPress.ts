import { useCallback, useRef } from 'react';

/**
 * Pulsación larga para abrir el menú de un elemento en pantallas táctiles.
 *
 * En escritorio ese menú se abre con el botón derecho; en un móvil no hay botón
 * derecho, así que sin esto la mitad de las acciones de un mensaje quedarían
 * fuera del alcance de quien usa el dedo.
 *
 * Se cancela al mover (se está desplazando la lista, no pulsando) y solo
 * atiende a toques: el ratón ya tiene su propio camino.
 */
export function useLongPress(
  onLongPress: (point: { clientX: number; clientY: number }) => void,
  delay = 450,
) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const point = { clientX: touch.clientX, clientY: touch.clientY };
      origin.current = { x: touch.clientX, y: touch.clientY };

      timer.current = window.setTimeout(() => {
        onLongPress(point);
        // Aviso háptico donde exista: confirma que se ha abierto algo.
        navigator.vibrate?.(8);
        clear();
      }, delay);
    },
    [onLongPress, delay, clear],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !origin.current) return;
      const moved =
        Math.abs(touch.clientX - origin.current.x) + Math.abs(touch.clientY - origin.current.y);
      if (moved > 12) clear();
    },
    [clear],
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
}
