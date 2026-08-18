import { create } from 'zustand';
import type { Call, CallAck, CallKind, RTCIceServerConfig, RtcSignalPayload } from '@kyro/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import {
  PeerMesh,
  ScreenShareCancelled,
  hasMultipleCameras,
  requestCamera,
  requestMedia,
  requestScreen,
  screenSharingSupported,
} from '@/webrtc/mesh';
import { rtcLog } from '@/webrtc/log';
import { toastError } from './ui';

/**
 * Estado de una llamada.
 *
 * `phase` es la única fuente de verdad sobre la llamada, y los medios se
 * describen con banderas independientes (`micMuted`, `cameraOn`, `screenOn`).
 * Las pistas se guardan por separado —audio, cámara y pantalla— porque
 * compartir pantalla no debe destruir la cámara: al dejar de compartir hay que
 * poder devolverla al instante y sin volver a pedir permisos.
 */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'reconnecting';

interface CallsState {
  phase: CallPhase;
  call: Call | null;
  incoming: Call | null;

  /** Vista previa local: audio + (pantalla si comparte, si no cámara). */
  localStream: MediaStream | null;
  audioTrack: MediaStreamTrack | null;
  cameraTrack: MediaStreamTrack | null;
  screenTrack: MediaStreamTrack | null;

  remoteStreams: Record<string, MediaStream>;
  remoteVideo: Record<string, boolean>;

  micMuted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  facingMode: 'user' | 'environment';
  canSwitchCamera: boolean;
  canShareScreen: boolean;

  /** Momento en que la llamada quedó conectada, para la duración. */
  connectedAt: number | null;

  iceServers: RTCIceServerConfig[];
  mesh: PeerMesh | null;
  selfId: string | null;

  start: (conversationId: string, kind: CallKind, selfId: string) => Promise<void>;
  accept: (selfId: string) => Promise<void>;
  decline: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  switchCamera: () => Promise<void>;

  applyIncoming: (call: Call, selfId: string) => void;
  applyUpdated: (call: Call, selfId: string) => void;
  applyEnded: (callId: string) => void;
  handleSignal: (payload: RtcSignalPayload) => void;
  reset: () => void;
}

export const useCalls = create<CallsState>((set, get) => ({
  phase: 'idle',
  call: null,
  incoming: null,

  localStream: null,
  audioTrack: null,
  cameraTrack: null,
  screenTrack: null,

  remoteStreams: {},
  remoteVideo: {},

  micMuted: false,
  cameraOn: false,
  screenOn: false,
  facingMode: 'user',
  canSwitchCamera: false,
  canShareScreen: screenSharingSupported(),

  connectedAt: null,

  iceServers: [],
  mesh: null,
  selfId: null,

  async start(conversationId, kind, selfId) {
    if (get().phase !== 'idle') return;
    const socket = getSocket();
    if (!socket?.connected) {
      toastError(new Error('Sin conexión: no se puede llamar ahora'));
      return;
    }

    set({ phase: 'outgoing', selfId });
    try {
      const stream = await requestMedia(kind === 'video');
      adoptMedia(set, get, stream, kind === 'video');

      const ack = await new Promise<CallAck>((resolve) => {
        socket.emit('call:start', { conversationId, kind }, resolve);
      });

      if (!ack.ok || !ack.call) {
        releaseMedia(get);
        set({ phase: 'idle', ...idleMedia() });
        toastError(new Error(ack.error ?? 'No se pudo iniciar la llamada'));
        return;
      }

      const iceServers = ack.iceServers ?? (await loadIceServers());
      set({ call: ack.call, iceServers });
      openMesh(set, get, ack.call, selfId, iceServers);
    } catch (err) {
      releaseMedia(get);
      set({ phase: 'idle', ...idleMedia() });
      toastError(err, 'No se pudo iniciar la llamada');
    }
  },

  async accept(selfId) {
    const call = get().incoming;
    const socket = getSocket();
    if (!call || !socket) return;

    set({ phase: 'connecting', selfId, incoming: null, call });
    try {
      const stream = await requestMedia(call.kind === 'video');
      const iceServers = get().iceServers.length ? get().iceServers : await loadIceServers();
      adoptMedia(set, get, stream, call.kind === 'video');
      set({ iceServers });
      socket.emit('call:accept', { callId: call.id });
      openMesh(set, get, call, selfId, iceServers);
    } catch (err) {
      socket.emit('call:decline', { callId: call.id });
      releaseMedia(get);
      set({ phase: 'idle', call: null, ...idleMedia() });
      toastError(err, 'No se pudo contestar');
    }
  },

  decline() {
    const call = get().incoming;
    if (!call) return;
    getSocket()?.emit('call:decline', { callId: call.id });
    set({ incoming: null, phase: 'idle' });
  },

  hangup() {
    const call = get().call;
    if (call) getSocket()?.emit('call:hangup', { callId: call.id });
    teardown(set, get);
  },

  toggleMic() {
    const track = get().audioTrack;
    if (!track) return;
    const muted = !get().micMuted;
    // Silenciar sin quitar la pista: la sesión no se renegocia y el otro
    // extremo sigue viendo la llamada como activa, solo en silencio.
    track.enabled = !muted;
    rtcLog(muted ? 'micrófono silenciado' : 'micrófono activo');
    set({ micMuted: muted });
  },

  async toggleCamera() {
    const mesh = get().mesh;
    if (!mesh) return;

    if (get().cameraOn) {
      const camera = get().cameraTrack;
      camera?.stop();
      set({ cameraTrack: null, cameraOn: false });
      // Si se está compartiendo pantalla, ese vídeo sigue su curso.
      if (!get().screenOn) mesh.setVideoTrack(null);
      refreshPreview(set, get);
      return;
    }

    try {
      const track = await requestCamera(get().facingMode);
      track.addEventListener('ended', () => {
        if (get().cameraTrack !== track) return;
        set({ cameraTrack: null, cameraOn: false });
        if (!get().screenOn) get().mesh?.setVideoTrack(null);
        refreshPreview(set, get);
      });
      set({ cameraTrack: track, cameraOn: true, canSwitchCamera: await hasMultipleCameras() });
      if (!get().screenOn) mesh.setVideoTrack(track);
      refreshPreview(set, get);
    } catch (err) {
      toastError(err, 'No se pudo activar la cámara');
    }
  },

  async toggleScreen() {
    const mesh = get().mesh;
    if (!mesh) return;

    if (get().screenOn) {
      stopScreen(set, get);
      return;
    }

    try {
      const display = await requestScreen();
      const [track] = display.getVideoTracks();
      if (!track) return;

      // Detener desde la barra del navegador tiene que devolver la cámara.
      track.addEventListener('ended', () => {
        if (get().screenTrack !== track) return;
        stopScreen(set, get);
      });

      set({ screenTrack: track, screenOn: true });
      mesh.setVideoTrack(track);
      refreshPreview(set, get);
    } catch (err) {
      if (err instanceof ScreenShareCancelled) return;
      toastError(err, 'No se pudo compartir la pantalla');
    }
  },

  async switchCamera() {
    if (!get().cameraOn) return;
    const mesh = get().mesh;
    if (!mesh) return;
    const facingMode = get().facingMode === 'user' ? 'environment' : 'user';

    try {
      const track = await requestCamera(facingMode);
      get().cameraTrack?.stop();
      set({ cameraTrack: track, facingMode });
      if (!get().screenOn) mesh.setVideoTrack(track);
      refreshPreview(set, get);
    } catch (err) {
      toastError(err, 'No se pudo cambiar de cámara');
    }
  },

  applyIncoming(call, selfId) {
    if (call.initiator.id === selfId) return;
    if (get().phase !== 'idle') return; // Ya hay una llamada en curso.
    set({ incoming: call, phase: 'incoming' });
  },

  applyUpdated(call, selfId) {
    if (get().call?.id !== call.id) return;
    set({ call });
    const mesh = get().mesh;
    if (mesh) mesh.sync(call.participants.map((participant) => participant.id));
    else if (get().phase === 'connecting' || get().phase === 'outgoing') {
      openMesh(set, get, call, selfId, get().iceServers);
    }
  },

  applyEnded(callId) {
    if (get().incoming?.id === callId) set({ incoming: null, phase: 'idle' });
    if (get().call?.id === callId) teardown(set, get);
  },

  handleSignal(payload) {
    void get().mesh?.handleSignal(payload);
  },

  reset() {
    teardown(set, get);
    set({ incoming: null });
  },
}));

type Setter = (partial: Partial<CallsState>) => void;
type Getter = () => CallsState;

/** Reparte el stream inicial entre las pistas que el store gestiona. */
function adoptMedia(set: Setter, get: Getter, stream: MediaStream, wantsCamera: boolean) {
  const audioTrack = stream.getAudioTracks()[0] ?? null;
  const cameraTrack = wantsCamera ? (stream.getVideoTracks()[0] ?? null) : null;
  set({ audioTrack, cameraTrack, cameraOn: Boolean(cameraTrack), micMuted: false });
  if (wantsCamera) void hasMultipleCameras().then((canSwitchCamera) => set({ canSwitchCamera }));
  refreshPreview(set, get);
}

/**
 * Reconstruye la vista previa local. Se crea un `MediaStream` nuevo a propósito:
 * la identidad cambia y el `<video>` vuelve a enlazarse, que es lo que hace que
 * el cambio de cámara a pantalla se vea de inmediato.
 */
function refreshPreview(set: Setter, get: Getter) {
  const { audioTrack, cameraTrack, screenTrack, screenOn } = get();
  const video = screenOn ? screenTrack : cameraTrack;
  const tracks = [audioTrack, video].filter((track): track is MediaStreamTrack => Boolean(track));
  set({ localStream: tracks.length ? new MediaStream(tracks) : null });
}

function stopScreen(set: Setter, get: Getter) {
  get().screenTrack?.stop();
  set({ screenTrack: null, screenOn: false });
  // Al dejar de compartir, la cámara vuelve si estaba encendida.
  const camera = get().cameraOn ? get().cameraTrack : null;
  get().mesh?.setVideoTrack(camera);
  rtcLog(camera ? 'pantalla detenida, cámara restaurada' : 'pantalla detenida');
  refreshPreview(set, get);
}

function openMesh(
  set: Setter,
  get: Getter,
  call: Call,
  selfId: string,
  iceServers: RTCIceServerConfig[],
) {
  get().mesh?.close();

  const mesh = new PeerMesh({
    scope: { kind: 'call', id: call.id },
    selfId,
    iceServers,
    onRemoteStream: (userId, stream) => {
      set({ remoteStreams: { ...get().remoteStreams, [userId]: stream } });
    },
    onRemoteVideo: (userId, hasVideo) => {
      set({ remoteVideo: { ...get().remoteVideo, [userId]: hasVideo } });
    },
    onPeerClosed: (userId) => {
      const { [userId]: _stream, ...streams } = get().remoteStreams;
      const { [userId]: _video, ...video } = get().remoteVideo;
      set({ remoteStreams: streams, remoteVideo: video });
    },
    onConnectionState: (_userId, state) => {
      if (get().phase === 'idle') return;
      if (state === 'connected') {
        set({ phase: 'active', connectedAt: get().connectedAt ?? Date.now() });
      } else if (state === 'disconnected' && get().phase === 'active') {
        set({ phase: 'reconnecting' });
      }
    },
  });

  mesh.setAudioTrack(get().audioTrack);
  mesh.setVideoTrack(get().screenOn ? get().screenTrack : get().cameraTrack);
  mesh.sync(call.participants.map((participant) => participant.id));

  set({
    mesh,
    call,
    phase: get().phase === 'outgoing' ? 'outgoing' : 'connecting',
  });
}

/** Detiene todo lo que ocupa cámara y micrófono. */
function releaseMedia(get: Getter) {
  get().audioTrack?.stop();
  get().cameraTrack?.stop();
  get().screenTrack?.stop();
}

function idleMedia() {
  return {
    localStream: null,
    audioTrack: null,
    cameraTrack: null,
    screenTrack: null,
    micMuted: false,
    cameraOn: false,
    screenOn: false,
    connectedAt: null,
  } satisfies Partial<CallsState>;
}

function teardown(set: Setter, get: Getter) {
  get().mesh?.close();
  releaseMedia(get);
  rtcLog('llamada finalizada y recursos liberados');
  set({
    phase: 'idle',
    call: null,
    mesh: null,
    remoteStreams: {},
    remoteVideo: {},
    ...idleMedia(),
  });
}

async function loadIceServers(): Promise<RTCIceServerConfig[]> {
  try {
    const data = await api.get<{ iceServers: RTCIceServerConfig[] }>('/calls/ice-servers');
    return data.iceServers;
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}
