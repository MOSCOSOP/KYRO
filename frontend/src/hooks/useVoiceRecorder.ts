import { useCallback, useEffect, useRef, useState } from 'react';
import { audioConstraints } from '@/lib/devices';

/**
 * Grabación de un mensaje de voz.
 *
 * Usa MediaRecorder con el formato que el navegador admita —Chrome y Firefox
 * dan webm/opus, Safari mp4— y mide el nivel en vivo para dibujar la onda: sin
 * ese movimiento no se distingue una grabación en curso de una pantalla
 * congelada.
 *
 * El micrófono se cierra siempre al terminar, se envíe o se descarte: nada de
 * dejar el indicador de grabación encendido.
 */

export interface VoiceRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** Niveles recientes, para dibujar la onda mientras se habla. */
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);
  const startedAt = useRef(0);

  const cleanup = useCallback(() => {
    for (const timer of timers.current) window.clearInterval(timer);
    timers.current = [];

    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;

    void context.current?.close().catch(() => undefined);
    context.current = null;
    recorder.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (recording) return false;
    setError(null);

    if (typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio');
      return false;
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
      stream.current = media;
      chunks.current = [];

      const mimeType = pickMimeType();
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.start(250);
      recorder.current = instance;

      startedAt.current = Date.now();
      setElapsed(0);
      setLevels([]);
      setRecording(true);

      timers.current.push(
        window.setInterval(() => setElapsed(Date.now() - startedAt.current), 100),
      );

      // Nivel de entrada para la onda.
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        context.current = ctx;
        const source = ctx.createMediaStreamSource(media);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buffer = new Uint8Array(analyser.fftSize);

        timers.current.push(
          window.setInterval(() => {
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (const sample of buffer) {
              const value = (sample - 128) / 128;
              sum += value * value;
            }
            const level = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
            // Se guarda una ventana corta: es lo que cabe en la barra.
            setLevels((current) => [...current.slice(-39), level]);
          }, 90),
        );
      }

      return true;
    } catch (err) {
      cleanup();
      setRecording(false);
      const name = (err as Error).name;
      setError(
        name === 'NotAllowedError'
          ? 'Necesitamos permiso para usar el micrófono'
          : 'No se pudo acceder al micrófono',
      );
      return false;
    }
  }, [recording, cleanup]);

  /** Detiene y devuelve la grabación, o null si se descarta o sale vacía. */
  const stop = useCallback(
    async (options: { discard?: boolean } = {}): Promise<VoiceRecording | null> => {
      const instance = recorder.current;
      if (!instance) {
        cleanup();
        setRecording(false);
        return null;
      }

      const durationMs = Date.now() - startedAt.current;

      const finished = new Promise<Blob | null>((resolve) => {
        instance.onstop = () => {
          if (options.discard || chunks.current.length === 0) return resolve(null);
          resolve(new Blob(chunks.current, { type: instance.mimeType || 'audio/webm' }));
        };
      });

      instance.stop();
      const blob = await finished;

      const mimeType = instance.mimeType || 'audio/webm';
      cleanup();
      setRecording(false);
      setLevels([]);
      setElapsed(0);

      // Menos de medio segundo es un toque sin querer, no un mensaje.
      if (!blob || durationMs < 500) return null;
      return { blob, mimeType, durationMs };
    },
    [cleanup],
  );

  return { recording, elapsed, levels, error, start, stop };
}
