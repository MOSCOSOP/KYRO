import { useEffect, useRef } from 'react';
import { Headphones, HeadphoneOff, LogOut, Mic, MicOff, Monitor, Volume2 } from 'lucide-react';
import { useVoice } from '@/store/voice';
import { IconButton } from '@/components/ui/Button';
import styles from './Calls.module.css';

/**
 * Barra fija mientras estás en una sala de voz: siempre visible, sin tapar la
 * navegación. Aquí también se reproduce el audio de los demás.
 */
export function VoiceBar() {
  const roomId = useVoice((state) => state.roomId);
  const roomName = useVoice((state) => state.roomName);
  const participants = useVoice((state) => state.participants);
  const remoteAudio = useVoice((state) => state.remoteAudio);
  const micMuted = useVoice((state) => state.micMuted);
  const deafened = useVoice((state) => state.deafened);
  const sharingScreen = useVoice((state) => state.sharingScreen);

  if (!roomId) return null;

  return (
    <div className={styles.voiceBar} role="status">
      <span className={styles.voiceText}>
        <span className={styles.voiceTitle}>
          <Volume2 size={14} /> Voz conectada
        </span>
        <span className={styles.voiceRoom}>
          {roomName} · {participants.length} {participants.length === 1 ? 'persona' : 'personas'}
        </span>
      </span>

      <span className={styles.voiceActions}>
        <IconButton
          label={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
          size="sm"
          active={micMuted}
          onClick={() => useVoice.getState().toggleMic()}
        >
          {micMuted ? <MicOff size={15} /> : <Mic size={15} />}
        </IconButton>
        <IconButton
          label={deafened ? 'Volver a escuchar' : 'Silenciar a todos'}
          size="sm"
          active={deafened}
          onClick={() => useVoice.getState().toggleDeafen()}
        >
          {deafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
        </IconButton>
        <IconButton
          label={sharingScreen ? 'Dejar de compartir' : 'Compartir pantalla'}
          size="sm"
          active={sharingScreen}
          onClick={() => void useVoice.getState().toggleScreen()}
        >
          <Monitor size={15} />
        </IconButton>
        <IconButton
          label="Salir de la sala"
          size="sm"
          danger
          onClick={() => useVoice.getState().leave()}
        >
          <LogOut size={15} />
        </IconButton>
      </span>

      {Object.entries(remoteAudio).map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} muted={deafened} />
      ))}
    </div>
  );
}

function RemoteAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
  }, [stream]);

  // Sin `controls` el elemento no pinta nada: no hace falta ocultarlo, y
  // ocultarlo con `display:none` es justo lo que impide oírlo en algunos móviles.
  return <audio ref={ref} autoPlay playsInline muted={muted} />;
}
