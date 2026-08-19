import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Pause, Play } from 'lucide-react';
import type { Attachment } from '@kyro/shared';
import styles from './VoiceNote.module.css';

const BARS = 34;

/**
 * Reproductor de una nota de voz.
 *
 * La onda no es decorativa: se calcula del audio real la primera vez que se
 * reproduce. Hasta entonces las barras están planas, porque dibujar una forma
 * inventada sería mentir sobre lo que hay dentro. Si el navegador no sabe
 * decodificar el formato, se quedan planas y el reproductor funciona igual.
 */
export function VoiceNote({ attachment }: { attachment: Attachment }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState((attachment.durationMs ?? 0) / 1000);
  const [wave, setWave] = useState<number[] | null>(null);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const onTime = () => setTime(element.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) setDuration(element.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };

    element.addEventListener('timeupdate', onTime);
    element.addEventListener('loadedmetadata', onLoaded);
    element.addEventListener('ended', onEnd);
    return () => {
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('ended', onEnd);
    };
  }, []);

  /** Envolvente real del audio, calculada una sola vez. */
  const analyse = async () => {
    if (wave) return;
    try {
      const response = await fetch(attachment.url);
      const buffer = await response.arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(buffer);
      const channel = decoded.getChannelData(0);
      const step = Math.floor(channel.length / BARS) || 1;

      const peaks: number[] = [];
      for (let index = 0; index < BARS; index++) {
        let peak = 0;
        for (let offset = 0; offset < step; offset++) {
          peak = Math.max(peak, Math.abs(channel[index * step + offset] ?? 0));
        }
        peaks.push(peak);
      }

      const loudest = Math.max(...peaks, 0.01);
      setWave(peaks.map((peak) => Math.max(0.12, peak / loudest)));
      void context.close().catch(() => undefined);
    } catch {
      // Formato que este navegador no decodifica: se queda plana.
    }
  };

  const toggle = () => {
    const element = audioRef.current;
    if (!element) return;

    if (playing) {
      element.pause();
      setPlaying(false);
      return;
    }

    void element.play().then(
      () => {
        setPlaying(true);
        void analyse();
      },
      () => setPlaying(false),
    );
  };

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = audioRef.current;
    if (!element || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    element.currentTime = ratio * duration;
    setTime(element.currentTime);
  };

  const progress = duration > 0 ? time / duration : 0;
  const remaining = Math.max(0, duration - time);

  return (
    <div className={styles.note}>
      <audio ref={audioRef} src={attachment.url} preload="metadata" />

      <button
        type="button"
        className={clsx(styles.play, playing && styles.playing)}
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Reproducir mensaje de voz'}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>

      <div
        className={styles.wave}
        onClick={seek}
        role="slider"
        tabIndex={0}
        aria-label="Posición del audio"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
      >
        {Array.from({ length: BARS }, (_, index) => (
          <span
            key={index}
            className={clsx(styles.bar, index / BARS <= progress && styles.barPlayed)}
            style={{ height: `${(wave ? wave[index] : 0.25) * 100}%` }}
          />
        ))}
      </div>

      <span className={styles.time}>{formatTime(playing || time > 0 ? remaining : duration)}</span>
    </div>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
