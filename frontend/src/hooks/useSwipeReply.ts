import { useRef, useState, type TouchEvent } from 'react';

interface TouchHandlers {
  onTouchStart?: (event: TouchEvent) => void;
  onTouchMove?: (event: TouchEvent) => void;
  onTouchEnd?: (event: TouchEvent) => void;
  onTouchCancel?: (event: TouchEvent) => void;
}

const DECIDE_AT = 10;
const TRIGGER_AT = 48;
const MAX_OFFSET = 72;

/**
 * Arrastrar un mensaje hacia la derecha para responderlo.
 *
 * En el móvil responder estaba a dos pasos (pulsación larga y menú). Este es el
 * gesto que ya espera cualquiera que venga de otra aplicación de mensajes, y
 * deja el menú para lo que se usa menos.
 *
 * La dirección se decide en los primeros diez píxeles: si el dedo va sobre todo
 * en vertical, el gesto se descarta y la lista se desplaza como siempre.
 */
export function useSwipeReply(
  onReply: () => void,
  { enabled, base }: { enabled: boolean; base?: TouchHandlers },
) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'horizontal' | 'vertical' | null>(null);
  // El recorrido también en una referencia: al soltar hay que leer el valor
  // real del gesto, no el que hubiera en el último dibujado.
  const travelled = useRef(0);

  const move = (value: number) => {
    travelled.current = value;
    setOffset(value);
  };

  const reset = () => {
    start.current = null;
    axis.current = null;
    travelled.current = 0;
    setDragging(false);
    setOffset(0);
  };

  const handlers: Required<TouchHandlers> = {
    onTouchStart(event) {
      base?.onTouchStart?.(event);
      if (!enabled) return;
      const touch = event.touches[0];
      if (!touch) return;
      start.current = { x: touch.clientX, y: touch.clientY };
      axis.current = null;
    },

    onTouchMove(event) {
      base?.onTouchMove?.(event);
      if (!enabled || !start.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;

      if (!axis.current) {
        if (Math.abs(dx) < DECIDE_AT && Math.abs(dy) < DECIDE_AT) return;
        axis.current = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'horizontal' : 'vertical';
        if (axis.current === 'horizontal') setDragging(true);
      }
      if (axis.current !== 'horizontal') return;

      // Solo hacia la derecha, y cada vez más duro: el recorrido tiene fondo.
      move(dx <= 0 ? 0 : Math.min(dx * 0.55, MAX_OFFSET));
    },

    onTouchEnd(event) {
      base?.onTouchEnd?.(event);
      if (axis.current === 'horizontal' && travelled.current >= TRIGGER_AT) {
        navigator.vibrate?.(8);
        onReply();
      }
      reset();
    },

    onTouchCancel(event) {
      base?.onTouchCancel?.(event);
      reset();
    },
  };

  return {
    handlers,
    offset,
    dragging,
    /** El gesto ya ha pasado el punto en el que suelta la respuesta. */
    armed: offset >= TRIGGER_AT,
  };
}
