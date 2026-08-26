import { useEffect, useState } from 'react';

/**
 * Mantiene un overlay montado mientras sale. `open` decide si algo debería
 * verse; `mounted` decide si sigue en el DOM. La diferencia entre ambos es la
 * ventana en la que corre la animación de salida.
 *
 * Componente: `const { mounted, phase, onExitComplete } = usePresence(open)`,
 * renderiza solo mientras `mounted`, anima según `phase`, y llama a
 * `onExitComplete` cuando la salida termina.
 */
export function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<'enter' | 'exit'>(open ? 'enter' : 'exit');

  useEffect(() => {
    if (open) {
      setMounted(true);
      setPhase('enter');
    } else {
      setPhase('exit');
    }
  }, [open]);

  const onExitComplete = () => setMounted(false);

  return { mounted, phase, onExitComplete };
}
