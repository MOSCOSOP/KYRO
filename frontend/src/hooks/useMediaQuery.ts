import { useEffect, useState } from 'react';

/** Consulta de medios reactiva, para adaptar comportamiento (no solo estilo). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Punto en el que la interfaz pasa de tres zonas a una sola. */
export function useIsCompact() {
  return useMediaQuery('(max-width: 900px)');
}
