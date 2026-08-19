import { useEffect, useRef, useState } from 'react';

/**
 * Quién está hablando, medido de verdad.
 *
 * Un solo AudioContext y un analizador por pista: se lee el nivel cada 200 ms y
 * se compara con un umbral con histéresis, de modo que el indicador no
 * parpadee entre sílabas. Sirve para que en una llamada de varios se vea al
 * instante quién tiene la palabra.
 *
 * El audio se analiza, nunca se reproduce desde aquí: de eso se encarga el
 * elemento <audio> de la llamada.
 */

const SAMPLE_MS = 200;
/** Empieza a hablar por encima de este nivel; deja de hablar por debajo. */
const ON = 0.045;
const OFF = 0.025;

export function useSpeaking(streams: Record<string, MediaStream>): Record<string, boolean> {
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const contextRef = useRef<AudioContext | null>(null);

  const keys = Object.keys(streams).sort().join(',');

  useEffect(() => {
    const entries = Object.entries(streams).filter(([, stream]) =>
      stream.getAudioTracks().some((track) => track.readyState === 'live'),
    );

    if (entries.length === 0) {
      setSpeaking({});
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    if (!contextRef.current || contextRef.current.state === 'closed') {
      contextRef.current = new Ctor();
    }
    const context = contextRef.current;

    const analysers = entries.map(([userId, stream]) => {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      return { userId, analyser, source, buffer: new Uint8Array(analyser.fftSize) };
    });

    const timer = window.setInterval(() => {
      setSpeaking((current) => {
        let changed = false;
        const next = { ...current };

        for (const { userId, analyser, buffer } of analysers) {
          analyser.getByteTimeDomainData(buffer);

          // Nivel eficaz de la onda: 128 es el silencio en este formato.
          let sum = 0;
          for (const sample of buffer) {
            const value = (sample - 128) / 128;
            sum += value * value;
          }
          const level = Math.sqrt(sum / buffer.length);

          const was = current[userId] ?? false;
          const now = was ? level > OFF : level > ON;
          if (now !== was) {
            next[userId] = now;
            changed = true;
          }
        }

        return changed ? next : current;
      });
    }, SAMPLE_MS);

    return () => {
      window.clearInterval(timer);
      for (const { source, analyser } of analysers) {
        source.disconnect();
        analyser.disconnect();
      }
    };
    // `keys` resume la identidad de las pistas: cambia solo al entrar o salir alguien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  useEffect(() => {
    return () => {
      void contextRef.current?.close().catch(() => undefined);
      contextRef.current = null;
    };
  }, []);

  return speaking;
}

/** Oculta algo tras un rato sin ratón ni teclado; vuelve al primer movimiento. */
export function useIdle(delay = 3500) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), delay);

    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), delay);
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
    for (const event of events) window.addEventListener(event, wake, { passive: true });

    return () => {
      window.clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, wake);
    };
  }, [delay]);

  return idle;
}
