import type { RTCIceServerConfig, RtcSignal, RtcSignalPayload } from '@kyro/shared';
import { getSocket } from '@/lib/socket';

/**
 * Malla WebRTC punto a punto.
 *
 * Sirve igual para una llamada privada y para una sala de voz de comunidad:
 * cambia solo el `scope`. El servidor únicamente enruta la señalización.
 *
 * Grupos pequeños (hasta ~8 personas) funcionan bien en malla. Para grupos
 * grandes haría falta un SFU: la señalización ya está preparada para
 * sustituirse sin tocar la interfaz.
 */

interface MeshOptions {
  scope: { kind: 'room' | 'call'; id: string };
  selfId: string;
  iceServers: RTCIceServerConfig[];
  onRemoteStream: (userId: string, stream: MediaStream) => void;
  onPeerClosed: (userId: string) => void;
  onFailure?: (userId: string) => void;
}

export class PeerMesh {
  private peers = new Map<string, RTCPeerConnection>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private localStream: MediaStream | null = null;
  private closed = false;

  constructor(private options: MeshOptions) {}

  setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    if (!stream) return;
    for (const [, peer] of this.peers) {
      for (const track of stream.getTracks()) {
        const sender = peer.getSenders().find((item) => item.track?.kind === track.kind);
        if (sender) void sender.replaceTrack(track);
        else peer.addTrack(track, stream);
      }
    }
  }

  /** Sustituye una pista sin renegociar (cambio de cámara o pantalla). */
  replaceTrack(track: MediaStreamTrack | null, kind: 'audio' | 'video') {
    for (const [, peer] of this.peers) {
      const sender = peer.getSenders().find((item) => item.track?.kind === kind);
      if (sender) void sender.replaceTrack(track);
    }
  }

  /** Ajusta la malla a la lista de participantes actual. */
  sync(userIds: string[]) {
    if (this.closed) return;
    const others = new Set(userIds.filter((id) => id !== this.options.selfId));

    for (const [userId, peer] of this.peers) {
      if (!others.has(userId)) {
        peer.close();
        this.peers.delete(userId);
        this.options.onPeerClosed(userId);
      }
    }

    for (const userId of others) {
      if (this.peers.has(userId)) continue;
      const peer = this.createPeer(userId);
      // Regla estable para decidir quién ofrece: evita ofertas cruzadas.
      if (this.isInitiator(userId)) void this.offer(userId, peer);
    }
  }

  private isInitiator(peerId: string) {
    return this.options.selfId < peerId;
  }

  private createPeer(userId: string) {
    const peer = new RTCPeerConnection({ iceServers: this.options.iceServers });
    this.peers.set(userId, peer);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        peer.addTrack(track, this.localStream);
      }
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.send(userId, { type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) this.options.onRemoteStream(userId, stream);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        this.options.onFailure?.(userId);
        // Reintento: se rehace la conexión desde cero.
        peer.close();
        this.peers.delete(userId);
        const retry = this.createPeer(userId);
        if (this.isInitiator(userId)) void this.offer(userId, retry);
      }
    };

    return peer;
  }

  private async offer(userId: string, peer: RTCPeerConnection) {
    try {
      const description = await peer.createOffer();
      await peer.setLocalDescription(description);
      this.send(userId, { type: 'offer', sdp: description.sdp ?? '' });
    } catch {
      // Una oferta fallida se recupera en el siguiente `sync`.
    }
  }

  async handleSignal(payload: RtcSignalPayload) {
    if (this.closed) return;
    const from = payload.from;
    if (!from || payload.scope.id !== this.options.scope.id) return;

    let peer = this.peers.get(from);
    if (!peer) peer = this.createPeer(from);

    const signal = payload.signal;
    try {
      if (signal.type === 'offer') {
        await peer.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        await this.drainCandidates(from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        this.send(from, { type: 'answer', sdp: answer.sdp ?? '' });
      } else if (signal.type === 'answer') {
        if (peer.signalingState === 'have-local-offer') {
          await peer.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          await this.drainCandidates(from, peer);
        }
      } else if (signal.type === 'candidate') {
        const candidate = signal.candidate as RTCIceCandidateInit;
        if (peer.remoteDescription) await peer.addIceCandidate(candidate);
        else {
          const queue = this.pendingCandidates.get(from) ?? [];
          queue.push(candidate);
          this.pendingCandidates.set(from, queue);
        }
      }
    } catch {
      // Señal inservible: la malla se recompone en el siguiente `sync`.
    }
  }

  private async drainCandidates(userId: string, peer: RTCPeerConnection) {
    const queue = this.pendingCandidates.get(userId);
    if (!queue) return;
    this.pendingCandidates.delete(userId);
    for (const candidate of queue) {
      await peer.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  private send(to: string, signal: RtcSignal) {
    getSocket()?.emit('rtc:signal', { scope: this.options.scope, to, signal });
  }

  close() {
    this.closed = true;
    for (const [userId, peer] of this.peers) {
      peer.close();
      this.options.onPeerClosed(userId);
    }
    this.peers.clear();
    this.pendingCandidates.clear();
  }
}

/** Pide micrófono (y cámara) con mensajes de error comprensibles. */
export async function requestMedia(video: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no permite llamadas');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'NotAllowedError') throw new Error('Necesitamos permiso para usar el micrófono');
    if (name === 'NotFoundError') throw new Error('No se ha encontrado micrófono ni cámara');
    throw new Error('No se pudo acceder a tus dispositivos');
  }
}

export async function requestScreen(): Promise<MediaStream> {
  const devices = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
  if (!devices.getDisplayMedia) throw new Error('Este navegador no permite compartir pantalla');
  return devices.getDisplayMedia({ video: true, audio: false });
}
