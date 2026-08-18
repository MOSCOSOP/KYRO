import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import type { PublicUser } from '@kyro/shared';
import { useCalls } from '@/store/calls';
import { useSession } from '@/store/session';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import styles from './Calls.module.css';

/** Llamada entrante + llamada en curso. Nada más aparece si no hay llamada. */
export function CallOverlay() {
  const phase = useCalls((state) => state.phase);
  const incoming = useCalls((state) => state.incoming);
  const call = useCalls((state) => state.call);
  const localStream = useCalls((state) => state.localStream);
  const remoteStreams = useCalls((state) => state.remoteStreams);
  const micMuted = useCalls((state) => state.micMuted);
  const cameraOn = useCalls((state) => state.cameraOn);
  const screenOn = useCalls((state) => state.screenOn);
  const selfId = useSession((state) => state.user?.id ?? '');

  if (phase === 'incoming' && incoming) {
    return createPortal(
      <div className={styles.incoming} role="alertdialog" aria-label="Llamada entrante">
        <div className={styles.incomingHead}>
          <Avatar user={incoming.initiator} size="lg" />
          <span className={styles.incomingText}>
            <span className={styles.incomingName}>{incoming.initiator.displayName}</span>
            <span className={styles.incomingMeta}>
              {incoming.kind === 'video' ? 'Videollamada entrante' : 'Llamada entrante'}
            </span>
          </span>
        </div>
        <div className={styles.incomingActions}>
          <Button
            variant="primary"
            block
            icon={<Phone size={16} />}
            onClick={() => void useCalls.getState().accept(selfId)}
          >
            Contestar
          </Button>
          <Button
            variant="danger"
            block
            icon={<PhoneOff size={16} />}
            onClick={() => useCalls.getState().decline()}
          >
            Rechazar
          </Button>
        </div>
      </div>,
      document.body,
    );
  }

  if (phase === 'idle' || !call) return null;

  const others = call.participants.filter((participant) => participant.id !== selfId);

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-label="Llamada en curso">
      <div className={styles.stage}>
        {others.length === 0 ? (
          <div className={styles.avatarStage}>
            <Avatar user={call.initiator} size="xl" />
            <span className={styles.callName}>
              {call.initiator.id === selfId
                ? 'Llamando…'
                : call.initiator.displayName}
            </span>
            <span className={styles.callState}>
              {phase === 'outgoing' ? 'Esperando respuesta' : 'Conectando…'}
            </span>
          </div>
        ) : (
          others.map((participant) => (
            <RemoteTile
              key={participant.id}
              user={participant}
              stream={remoteStreams[participant.id]}
            />
          ))
        )}

        {localStream && (cameraOn || screenOn) ? (
          <LocalTile stream={localStream} label={screenOn ? 'Tu pantalla' : 'Tú'} />
        ) : null}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={clsx(styles.control, micMuted && styles.controlActive)}
          onClick={() => useCalls.getState().toggleMic()}
          aria-label={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
          title={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
        >
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button
          type="button"
          className={clsx(styles.control, cameraOn && styles.controlActive)}
          onClick={() => void useCalls.getState().toggleCamera()}
          aria-label={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
          title={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          type="button"
          className={clsx(styles.control, screenOn && styles.controlActive)}
          onClick={() => void useCalls.getState().toggleScreen()}
          aria-label={screenOn ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
          title={screenOn ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
        >
          {screenOn ? <MonitorOff size={20} /> : <Monitor size={20} />}
        </button>

        <button
          type="button"
          className={clsx(styles.control, styles.hangup)}
          onClick={() => useCalls.getState().hangup()}
          aria-label="Colgar"
          title="Colgar"
        >
          <PhoneOff size={22} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function RemoteTile({ user, stream }: { user: PublicUser; stream?: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.enabled));

  return (
    <div className={styles.tile}>
      {stream ? (
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          playsInline
          style={{ display: hasVideo ? 'block' : 'none' }}
        />
      ) : null}
      {!hasVideo ? (
        <div className={styles.avatarStage}>
          <Avatar user={user} size="xl" />
          <span className={styles.callState}>{stream ? 'Solo audio' : 'Conectando…'}</span>
        </div>
      ) : null}
      <span className={styles.tileLabel}>{user.displayName}</span>
    </div>
  );
}

function LocalTile({ stream, label }: { stream: MediaStream; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className={styles.tile}>
      <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}
