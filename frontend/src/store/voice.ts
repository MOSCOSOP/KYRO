import { create } from 'zustand';
import type { RTCIceServerConfig, RoomJoinAck, RoomParticipant, RtcSignalPayload } from '@kyro/shared';
import { getSocket } from '@/lib/socket';
import { PeerMesh, requestMedia, requestScreen } from '@/webrtc/mesh';
import { useCommunities } from './communities';
import { toastError } from './ui';

/**
 * Salas de voz de comunidad. Comparte la malla WebRTC con las llamadas
 * privadas: la diferencia es que aquí se entra y se sale libremente.
 */
interface VoiceState {
  roomId: string | null;
  roomName: string | null;
  communityId: string | null;
  joining: boolean;
  participants: RoomParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  micMuted: boolean;
  deafened: boolean;
  sharingScreen: boolean;
  mesh: PeerMesh | null;

  join: (input: {
    roomId: string;
    roomName: string;
    communityId: string;
    selfId: string;
  }) => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleDeafen: () => void;
  toggleScreen: () => Promise<void>;
  applyState: (roomId: string, participants: RoomParticipant[]) => void;
  handleSignal: (payload: RtcSignalPayload) => void;
  reset: () => void;
}

export const useVoice = create<VoiceState>((set, get) => ({
  roomId: null,
  roomName: null,
  communityId: null,
  joining: false,
  participants: [],
  localStream: null,
  remoteStreams: {},
  micMuted: false,
  deafened: false,
  sharingScreen: false,
  mesh: null,

  async join({ roomId, roomName, communityId, selfId }) {
    if (get().roomId === roomId || get().joining) return;
    const socket = getSocket();
    if (!socket?.connected) {
      toastError(new Error('Sin conexión: no se puede entrar a la sala'));
      return;
    }
    if (get().roomId) get().leave();

    set({ joining: true });
    try {
      const stream = await requestMedia(false);
      const ack = await new Promise<RoomJoinAck>((resolve) => {
        socket.emit('room:join', { roomId }, resolve);
      });

      if (!ack.ok) {
        stopStream(stream);
        set({ joining: false });
        toastError(new Error(ack.error ?? 'No se pudo entrar a la sala'));
        return;
      }

      const participants = ack.participants ?? [];
      const iceServers: RTCIceServerConfig[] = ack.iceServers ?? [];

      const mesh = new PeerMesh({
        scope: { kind: 'room', id: roomId },
        selfId,
        iceServers,
        onRemoteStream: (userId, remote) => {
          set({ remoteStreams: { ...get().remoteStreams, [userId]: remote } });
        },
        onPeerClosed: (userId) => {
          const { [userId]: _gone, ...rest } = get().remoteStreams;
          set({ remoteStreams: rest });
        },
      });
      mesh.setLocalStream(stream);
      mesh.sync(participants.map((participant) => participant.user.id));

      set({
        roomId,
        roomName,
        communityId,
        participants,
        localStream: stream,
        mesh,
        joining: false,
        micMuted: false,
        deafened: false,
        sharingScreen: false,
      });
    } catch (err) {
      set({ joining: false });
      toastError(err, 'No se pudo entrar a la sala');
    }
  },

  leave() {
    const roomId = get().roomId;
    if (roomId) getSocket()?.emit('room:leave', { roomId });
    get().mesh?.close();
    const stream = get().localStream;
    if (stream) stopStream(stream);
    set({
      roomId: null,
      roomName: null,
      communityId: null,
      participants: [],
      localStream: null,
      remoteStreams: {},
      mesh: null,
      micMuted: false,
      deafened: false,
      sharingScreen: false,
    });
  },

  toggleMic() {
    const stream = get().localStream;
    const roomId = get().roomId;
    if (!stream || !roomId) return;
    const muted = !get().micMuted;
    for (const track of stream.getAudioTracks()) track.enabled = !muted;
    set({ micMuted: muted });
    getSocket()?.emit('room:state-set', { roomId, muted });
  },

  toggleDeafen() {
    const roomId = get().roomId;
    if (!roomId) return;
    const deafened = !get().deafened;
    // Silenciar a los demás implica silenciarte a ti: es lo esperable.
    const stream = get().localStream;
    if (stream) for (const track of stream.getAudioTracks()) track.enabled = !(deafened || get().micMuted);
    set({ deafened, micMuted: deafened ? true : get().micMuted });
    getSocket()?.emit('room:state-set', { roomId, deafened, muted: deafened ? true : get().micMuted });
  },

  async toggleScreen() {
    const roomId = get().roomId;
    const mesh = get().mesh;
    const stream = get().localStream;
    if (!roomId || !mesh || !stream) return;

    if (get().sharingScreen) {
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      mesh.replaceTrack(null, 'video');
      set({ sharingScreen: false });
      getSocket()?.emit('room:state-set', { roomId, sharingScreen: false });
      return;
    }

    try {
      const display = await requestScreen();
      const [track] = display.getVideoTracks();
      if (!track) return;
      stream.addTrack(track);
      mesh.setLocalStream(stream);
      track.onended = () => {
        stream.removeTrack(track);
        mesh.replaceTrack(null, 'video');
        set({ sharingScreen: false });
        getSocket()?.emit('room:state-set', { roomId, sharingScreen: false });
      };
      set({ sharingScreen: true });
      getSocket()?.emit('room:state-set', { roomId, sharingScreen: true });
    } catch {
      // El usuario canceló el diálogo del navegador.
    }
  },

  applyState(roomId, participants) {
    useCommunities.getState().applyRoomState(roomId, participants);
    if (get().roomId !== roomId) return;
    set({ participants });
    get().mesh?.sync(participants.map((participant) => participant.user.id));
  },

  handleSignal(payload) {
    void get().mesh?.handleSignal(payload);
  },

  reset() {
    get().leave();
  },
}));

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}
