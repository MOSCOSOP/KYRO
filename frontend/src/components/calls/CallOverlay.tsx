import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  Loader2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Phone,
  PhoneOff,
  ScreenShare,
  SwitchCamera,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { PublicUser } from '@kyro/shared';
import { useCalls, type CallPhase } from '@/store/calls';
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
  const remoteVideo = useCalls((state) => state.remoteVideo);
  const micMuted = useCalls((state) => state.micMuted);
  const cameraOn = useCalls((state) => state.cameraOn);
  const screenOn = useCalls((state) => state.screenOn);
  const canSwitchCamera = useCalls((state) => state.canSwitchCamera);
  const canShareScreen = useCalls((state) => state.canShareScreen);
  const connectedAt = useCalls((state) => state.connectedAt);
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
  const showLocalPreview = Boolean(localStream) && (cameraOn || screenOn);

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-label="Llamada en curso">
      <header className={styles.callHeader}>
        <span className={styles.callHeading}>
          <span className={styles.callTitle}>
            {others.length === 1 ? others[0].displayName : `Llamada · ${call.participants.length}`}
          </span>
          <PhaseLine phase={phase} connectedAt={connectedAt} />
        </span>
        <ConnectionBadge phase={phase} />
      </header>

      <div className={clsx(styles.stage, others.length > 1 && styles.stageGrid)}>
        {others.length === 0 ? (
          <div className={styles.avatarStage}>
            <Avatar user={call.initiator} size="xl" />
            <span className={styles.callName}>
              {call.initiator.id === selfId ? 'Llamando…' : call.initiator.displayName}
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
              hasVideo={Boolean(remoteVideo[participant.id])}
            />
          ))
        )}

        {showLocalPreview && localStream ? (
          <LocalTile stream={localStream} sharing={screenOn} muted={micMuted} />
        ) : null}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={clsx(styles.control, micMuted && styles.controlOff)}
          onClick={() => useCalls.getState().toggleMic()}
          aria-pressed={micMuted}
          aria-label={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
          title={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
        >
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button
          type="button"
          className={clsx(styles.control, cameraOn && styles.controlActive)}
          onClick={() => void useCalls.getState().toggleCamera()}
          aria-pressed={cameraOn}
          aria-label={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
          title={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {canSwitchCamera && cameraOn ? (
          <button
            type="button"
            className={styles.control}
            onClick={() => void useCalls.getState().switchCamera()}
            aria-label="Cambiar de cámara"
            title="Cambiar de cámara"
          >
            <SwitchCamera size={20} />
          </button>
        ) : null}

        {canShareScreen ? (
          <button
            type="button"
            className={clsx(styles.control, screenOn && styles.controlActive)}
            onClick={() => void useCalls.getState().toggleScreen()}
            aria-pressed={screenOn}
            aria-label={screenOn ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
            title={screenOn ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
          >
            {screenOn ? <MonitorOff size={20} /> : <Monitor size={20} />}
          </button>
        ) : null}

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

const PHASE_TEXT: Record<CallPhase, string> = {
  idle: '',
  incoming: 'Llamada entrante',
  outgoing: 'Llamando…',
  connecting: 'Conectando…',
  active: '',
  reconnecting: 'Reconectando…',
};

/** Duración cuando la llamada está en pie; el estado en cualquier otro caso. */
function PhaseLine({ phase, connectedAt }: { phase: CallPhase; connectedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase !== 'active' || !connectedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase, connectedAt]);

  const duration = useMemo(() => {
    if (!connectedAt) return null;
    const seconds = Math.max(0, Math.floor((now - connectedAt) / 1000));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0
      ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`
      : `${minutes}:${pad(seconds % 60)}`;
  }, [connectedAt, now]);

  if (phase === 'active' && duration) return <span className={styles.callState}>{duration}</span>;
  return <span className={styles.callState}>{PHASE_TEXT[phase]}</span>;
}

function ConnectionBadge({ phase }: { phase: CallPhase }) {
  if (phase === 'reconnecting') {
    return (
      <span className={clsx(styles.badge, styles.badgeWarn)}>
        <WifiOff size={13} /> Reconectando
      </span>
    );
  }
  if (phase === 'active') {
    return (
      <span className={styles.badge}>
        <Wifi size={13} /> Conectado
      </span>
    );
  }
  return (
    <span className={styles.badge}>
      <Loader2 size={13} className={styles.spin} /> Estableciendo
    </span>
  );
}

function RemoteTile({
  user,
  stream,
  hasVideo,
}: {
  user: PublicUser;
  stream?: MediaStream;
  hasVideo: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // El audio remoto se reproduce siempre, con o sin imagen: el elemento se
  // mantiene enlazado y solo se oculta cuando no hay vídeo que mostrar.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !stream) return;
    element.srcObject = stream;
    // Autoplay con sonido puede quedar bloqueado; reintentar en silencio es
    // preferible a dejar la llamada muda sin decir nada.
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={clsx(styles.tile, styles.tileRemote)}>
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

/** Vista previa propia: silenciada siempre para no acoplar el micrófono. */
function LocalTile({
  stream,
  sharing,
  muted,
}: {
  stream: MediaStream;
  sharing: boolean;
  muted: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={clsx(styles.tile, styles.localTile)}>
      <video
        ref={videoRef}
        className={clsx(styles.video, !sharing && styles.mirrored)}
        autoPlay
        playsInline
        muted
      />
      <span className={styles.tileLabel}>
        {sharing ? <ScreenShare size={13} /> : null}
        {muted ? <MicOff size={13} /> : null}
        {sharing ? 'Tu pantalla' : 'Tú'}
      </span>
    </div>
  );
}
