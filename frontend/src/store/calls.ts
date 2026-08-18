import { create } from 'zustand';
import type { Call, CallAck, CallKind, RTCIceServerConfig, RtcSignalPayload } from '@kyro/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { PeerMesh, requestMedia, requestScreen } from '@/webrtc/mesh';
import { toastError } from './ui';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';

interface CallsState {
  phase: CallPhase;
  call: Call | null;
  incoming: Call | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  micMuted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
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
  remoteStreams: {},
  micMuted: false,
  cameraOn: false,
  screenOn: false,
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
      set({ localStream: stream, cameraOn: kind === 'video' });

      const ack = await new Promise<CallAck>((resolve) => {
        socket.emit('call:start', { conversationId, kind }, resolve);
      });

      if (!ack.ok || !ack.call) {
        stopStream(stream);
        set({ phase: 'idle', localStream: null, cameraOn: false });
        toastError(new Error(ack.error ?? 'No se pudo iniciar la llamada'));
        return;
      }

      const iceServers = ack.iceServers ?? (await loadIceServers());
      set({ call: ack.call, iceServers });
      openMesh(set, get, ack.call, selfId, iceServers);
    } catch (err) {
      const stream = get().localStream;
      if (stream) stopStream(stream);
      set({ phase: 'idle', localStream: null });
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
      set({ localStream: stream, cameraOn: call.kind === 'video', iceServers });
      socket.emit('call:accept', { callId: call.id });
      openMesh(set, get, call, selfId, iceServers);
    } catch (err) {
      socket.emit('call:decline', { callId: call.id });
      set({ phase: 'idle', call: null });
      toastError(err, 'No se pudo contestar');
    }
  },

  decline() {
    const call = get().incoming;
    if (!call) return;
    getSocket()?.emit('call:decline', { callId: call.id });
    set({ incoming: null });
  },

  hangup() {
    const call = get().call;
    if (call) getSocket()?.emit('call:hangup', { callId: call.id });
    teardown(set, get);
  },

  toggleMic() {
    const stream = get().localStream;
    if (!stream) return;
    const muted = !get().micMuted;
    for (const track of stream.getAudioTracks()) track.enabled = !muted;
    set({ micMuted: muted });
  },

  async toggleCamera() {
    const stream = get().localStream;
    const mesh = get().mesh;
    if (!stream || !mesh) return;

    if (get().cameraOn) {
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      mesh.replaceTrack(null, 'video');
      set({ cameraOn: false, screenOn: false });
      return;
    }

    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: true });
      const [track] = camera.getVideoTracks();
      if (!track) return;
      stream.addTrack(track);
      mesh.replaceTrack(track, 'video');
      set({ cameraOn: true, screenOn: false, localStream: stream });
    } catch {
      toastError(new Error('No se pudo activar la cámara'));
    }
  },

  async toggleScreen() {
    const stream = get().localStream;
    const mesh = get().mesh;
    if (!stream || !mesh) return;

    if (get().screenOn) {
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      mesh.replaceTrack(null, 'video');
      set({ screenOn: false, cameraOn: false });
      return;
    }

    try {
      const display = await requestScreen();
      const [track] = display.getVideoTracks();
      if (!track) return;
      for (const existing of stream.getVideoTracks()) {
        existing.stop();
        stream.removeTrack(existing);
      }
      stream.addTrack(track);
      mesh.replaceTrack(track, 'video');
      // Si se detiene desde la barra del navegador, se refleja en la interfaz.
      track.onended = () => {
        stream.removeTrack(track);
        mesh.replaceTrack(null, 'video');
        set({ screenOn: false });
      };
      set({ screenOn: true, cameraOn: false, localStream: stream });
    } catch {
      // Cancelar el diálogo del navegador no es un error que reportar.
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
      set({ remoteStreams: { ...get().remoteStreams, [userId]: stream }, phase: 'active' });
    },
    onPeerClosed: (userId) => {
      const { [userId]: _gone, ...rest } = get().remoteStreams;
      set({ remoteStreams: rest });
    },
  });

  mesh.setLocalStream(get().localStream);
  mesh.sync(call.participants.map((participant) => participant.id));

  set({
    mesh,
    call,
    phase: call.participants.length > 1 ? 'active' : get().phase === 'outgoing' ? 'outgoing' : 'connecting',
  });
}

function teardown(set: Setter, get: Getter) {
  get().mesh?.close();
  const stream = get().localStream;
  if (stream) stopStream(stream);
  set({
    phase: 'idle',
    call: null,
    mesh: null,
    localStream: null,
    remoteStreams: {},
    micMuted: false,
    cameraOn: false,
    screenOn: false,
  });
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

async function loadIceServers(): Promise<RTCIceServerConfig[]> {
  try {
    const data = await api.get<{ iceServers: RTCIceServerConfig[] }>('/calls/ice-servers');
    return data.iceServers;
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}
