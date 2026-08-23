import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { PublicUser } from '@kyro/shared';
import { startRingback, stopRingback } from '@/lib/alerts';
import { useCalls, type CallPhase } from '@/store/calls';
import { useSession } from '@/store/session';
import { useIdle, useSpeaking } from '@/hooks/useSpeaking';
import { Avatar } from '@/components/ui/Avatar';
import styles from './Calls.module.css';

/** Llamada entrante + llamada en curso. Nada más aparece si no hay llamada. */
export function CallOverlay() {
  const phase = useCalls((state) => state.phase);
  const incoming = useCalls((state) => state.incoming);
  const call = useCalls((state) => state.call);
  const localStream = useCalls((state) => state.localStream);
  const remoteAudio = useCalls((state) => state.remoteAudio);
  const remoteStreams = useCalls((state) => state.remoteStreams);
  const remoteVideo = useCalls((state) => state.remoteVideo);
  const micMuted = useCalls((state) => state.micMuted);
  const cameraOn = useCalls((state) => state.cameraOn);
  const screenOn = useCalls((state) => state.screenOn);
  const canSwitchCamera = useCalls((state) => state.canSwitchCamera);
  const canShareScreen = useCalls((state) => state.canShareScreen);
  const connectedAt = useCalls((state) => state.connectedAt);
  const selfId = useSession((state) => state.user?.id ?? '');

  /* Quién habla, y controles que se apartan cuando no los usas. */
  const speaking = useSpeaking(remoteAudio);
  const idle = useIdle(4000);

  /* Al colgar, un cierre breve en vez de un corte seco. */
  const [ended, setEnded] = useState<{ name: string; duration: string } | null>(null);
  const lastCall = useRef<{ name: string; connectedAt: number | null } | null>(null);

  useEffect(() => {
    if (!call) return;
    const others = call.participants.filter((participant) => participant.id !== selfId);
    lastCall.current = {
      name: others[0]?.displayName ?? call.initiator.displayName,
      connectedAt,
    };
  }, [call, connectedAt, selfId]);

  /*
   * El tono de llamada saliente vive con la fase, no con el botón de llamar:
   * así se corta igual si contestan, si cuelgan o si la llamada falla.
   */
  useEffect(() => {
    if (phase !== 'outgoing') return;
    startRingback();
    return () => stopRingback();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'idle' || !lastCall.current) return;
    const info = lastCall.current;
    lastCall.current = null;
    setEnded({
      name: info.name,
      duration: info.connectedAt ? elapsed(Date.now() - info.connectedAt) : 'Sin conexión',
    });
    const timer = window.setTimeout(() => setEnded(null), 1800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'incoming' && incoming) {
    return createPortal(
      <div className={styles.incoming} role="alertdialog" aria-label="Llamada entrante">
        <div className={styles.incomingHead}>
          <span className={styles.incomingRings}>
            <Avatar user={incoming.initiator} size="xl" />
          </span>
          <span className={styles.incomingText}>
            <span className={styles.incomingName}>{incoming.initiator.displayName}</span>
            <span className={styles.incomingHandle}>@{incoming.initiator.username}</span>
            <span className={styles.incomingMeta}>
              {incoming.kind === 'video' ? 'Videollamada entrante' : 'Llamada entrante'}
            </span>
          </span>
        </div>

        <div className={styles.incomingActions}>
          <button
            type="button"
            className={styles.bigAction}
            onClick={() => useCalls.getState().decline()}
          >
            <span className={clsx(styles.bigCircle, styles.declineCircle)}>
              <PhoneOff size={24} />
            </span>
            Rechazar
          </button>

          <button
            type="button"
            className={styles.bigAction}
            onClick={() => void useCalls.getState().accept(selfId)}
            autoFocus
          >
            <span className={clsx(styles.bigCircle, styles.acceptCircle)}>
              <Phone size={24} />
            </span>
            Contestar
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  if (phase === 'idle' || !call) {
    if (!ended) return null;
    return createPortal(
      <div className={styles.endCard} role="status">
        <div className={styles.endInner}>
          <PhoneOff size={22} color="var(--text-tertiary)" />
          <span className={styles.endTitle}>Llamada finalizada</span>
          <span className={styles.endMeta}>
            {ended.name} · {ended.duration}
          </span>
        </div>
      </div>,
      document.body,
    );
  }

  const others = call.participants.filter((participant) => participant.id !== selfId);
  const showLocalPreview = Boolean(localStream) && (cameraOn || screenOn);

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-label="Llamada en curso">
      <RemoteAudioLayer streams={remoteAudio} />

      <header className={clsx(styles.callHeaderFloating, idle && styles.headerHidden)}>
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
              speaking={Boolean(speaking[participant.id])}
            />
          ))
        )}

        {showLocalPreview && localStream ? (
          <LocalTile stream={localStream} sharing={screenOn} muted={micMuted} />
        ) : null}
      </div>

      <div className={clsx(styles.controls, idle && styles.controlsHidden)}>
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

/** mm:ss (o h:mm:ss) para la duración de una llamada. */
function elapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
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

/**
 * El audio de los demás vive en sus propios elementos, fuera de los tiles de
 * vídeo. Así se sigue oyendo la llamada aunque no haya imagen, aunque el vídeo
 * esté oculto o aunque el navegador se niegue a reproducirlo.
 *
 * Si el navegador bloquea la reproducción automática, se pide un toque: es la
 * única forma de desbloquearla y callarlo en silencio sería peor.
 */
function RemoteAudioLayer({ streams }: { streams: Record<string, MediaStream> }) {
  const elements = useRef(new Map<string, HTMLAudioElement>());
  const [blocked, setBlocked] = useState(false);

  const play = useCallback((element: HTMLAudioElement) => {
    element.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
  }, []);

  const attach = useCallback(
    (userId: string, element: HTMLAudioElement | null) => {
      if (!element) {
        elements.current.delete(userId);
        return;
      }
      elements.current.set(userId, element);
      const stream = streams[userId];
      if (stream && element.srcObject !== stream) element.srcObject = stream;
      play(element);
    },
    [play, streams],
  );

  const unlock = () => {
    for (const element of elements.current.values()) play(element);
  };

  return (
    <>
      {Object.keys(streams).map((userId) => (
        <audio key={userId} ref={(element) => attach(userId, element)} autoPlay playsInline />
      ))}
      {blocked ? (
        <button type="button" className={styles.audioUnlock} onClick={unlock}>
          <Volume2 size={15} /> Toca para escuchar la llamada
        </button>
      ) : null}
    </>
  );
}

function RemoteTile({
  user,
  stream,
  hasVideo,
  speaking,
}: {
  user: PublicUser;
  stream?: MediaStream;
  hasVideo: boolean;
  speaking: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !stream) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
  }, [stream]);

  return (
    <div className={clsx(styles.tile, styles.tileRemote, speaking && styles.speaking)}>
      {/*
        Silenciado a propósito: el sonido sale del elemento de audio. Un vídeo
        silenciado además puede reproducirse siempre, sin permiso del usuario.
      */}
      <video
        ref={videoRef}
        className={clsx(styles.video, styles.videoFill, !hasVideo && styles.videoHidden)}
        autoPlay
        playsInline
        muted
      />
      {!hasVideo ? (
        <div className={styles.avatarStage}>
          <span className={clsx(styles.halo, !stream && styles.haloPulse)}>
            <Avatar user={user} size="xl" />
          </span>
          <span className={styles.callState}>{stream ? 'Solo audio' : 'Conectando…'}</span>
        </div>
      ) : null}
      <span className={styles.tileLabel}>
        {speaking ? <Mic size={12} className={styles.speakingDot} /> : null}
        {user.displayName}
      </span>
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
        className={clsx(
          styles.video,
          styles.videoFill,
          sharing ? styles.videoContain : styles.mirrored,
        )}
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
