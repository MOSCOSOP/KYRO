import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/store/ui';

/** Atajos globales. Pocos y predecibles. */
export function useShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;

      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        useUI.getState().openSearch();
        return;
      }

      // Los atajos de navegación no deben dispararse mientras se escribe.
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing || !meta || !event.shiftKey) return;

      const routes: Record<string, string> = {
        h: '/',
        m: '/mensajes',
        c: '/comunidades',
        a: '/actividad',
        l: '/llamadas',
      };
      const route = routes[event.key.toLowerCase()];
      if (route) {
        event.preventDefault();
        navigate(route);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
