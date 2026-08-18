import type { RTCIceServerConfig, RtcSignal, RtcSignalPayload } from '@kyro/shared';
import { getSocket } from '@/lib/socket';
import { rtcLog, rtcWarn } from './log';

/**
 * Malla WebRTC punto a punto.
 *
 * Sirve igual para una llamada privada y para una sala de voz de comunidad:
 * cambia solo el `scope`. El servidor únicamente enruta la señalización.
 *
 * Dos decisiones sostienen el resto:
 *
 * **Las m-lines se reservan al crear la conexión.** Cada peer nace con un
 * transceiver de audio y otro de vídeo en `sendrecv`, aunque todavía no haya
 * cámara. Encender la cámara a mitad de una llamada de voz es entonces un
 * `replaceTrack` sobre un sender que ya existe y que ya viaja en el SDP: no
 * hace falta renegociar y el vídeo aparece en el otro extremo al instante.
 *
 * **Negociación perfecta.** El orden de los identificadores decide quién es
 * impaciente (ofrece) y quién es cortés (cede ante una colisión de ofertas).
 * Sin esto, dos ofertas simultáneas dejan la conexión encallada.
 *
 * Grupos pequeños (hasta ~8 personas) funcionan bien en malla. Para grupos
 * grandes haría falta un SFU: la señalización ya está preparada para
 * sustituirse sin tocar la interfaz.
 */

interface MeshOptions {
  scope: { kind: 'room' | 'call'; id: string };
  selfId: string;
  iceServers: RTCIceServerConfig[];
  /**
   * Audio y vídeo remotos llegan en streams separados a propósito: el elemento
   * de vídeo puede ocultarse o silenciarse sin arrastrar el audio con él.
   */
  onRemoteAudio: (userId: string, stream: MediaStream) => void;
  onRemoteStream: (userId: string, stream: MediaStream) => void;
  /** El participante remoto está enviando vídeo utilizable (cámara o pantalla). */
  onRemoteVideo: (userId: string, hasVideo: boolean) => void;
  onPeerClosed: (userId: string) => void;
  onConnectionState?: (userId: string, state: RTCPeerConnectionState) => void;
  onFailure?: (userId: string) => void;
}

interface Peer {
  pc: RTCPeerConnection;
  audioSender: RTCRtpSender;
  videoSender: RTCRtpSender;
  /** Streams propios de la malla: se les añaden las pistas remotas al llegar. */
  remoteAudio: MediaStream;
  remoteVideo: MediaStream;
  /** El cortés cede ante una colisión; el impaciente inicia la oferta. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  /**
   * Falso hasta que termina el primer intercambio. Crear los transceivers
   * dispara `negotiationneeded`, y ese primer aviso ya está cubierto por la
   * oferta inicial: atenderlo provocaría una oferta duplicada.
   */
  negotiated: boolean;
  hasRemoteVideo: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

export class PeerMesh {
  private peers = new Map<string, Peer>();
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private closed = false;

  constructor(private options: MeshOptions) {}

  /** Pistas locales iniciales. Las siguientes se cambian una a una. */
  setLocalStream(stream: MediaStream | null) {
    this.setAudioTrack(stream?.getAudioTracks()[0] ?? null);
    this.setVideoTrack(stream?.getVideoTracks()[0] ?? null);
  }

  setAudioTrack(track: MediaStreamTrack | null) {
    this.audioTrack = track;
    rtcLog(track ? 'pista de audio local lista' : 'audio local retirado');
    for (const [userId, peer] of this.peers) this.attach(userId, peer.audioSender, track, 'audio');
  }

  /**
   * Cámara, pantalla o nada. Al reutilizar el sender reservado, el cambio llega
   * al otro extremo sin renegociar y sin cortar el audio.
   */
  setVideoTrack(track: MediaStreamTrack | null) {
    this.videoTrack = track;
    rtcLog(track ? `pista de vídeo local lista (${track.label || 'sin etiqueta'})` : 'vídeo local retirado');
    for (const [userId, peer] of this.peers) this.attach(userId, peer.videoSender, track, 'video');
  }

  private attach(
    userId: string,
    sender: RTCRtpSender,
    track: MediaStreamTrack | null,
    kind: 'audio' | 'video',
  ) {
    sender.replaceTrack(track).then(
      () => rtcLog(`${kind} enviado a ${userId}`, track ? track.id : null),
      (err) => rtcWarn(`no se pudo cambiar la pista de ${kind} hacia ${userId}`, err),
    );
  }

  /** Ajusta la malla a la lista de participantes actual. */
  sync(userIds: string[]) {
    if (this.closed) return;
    const others = new Set(userIds.filter((id) => id !== this.options.selfId));

    for (const [userId, peer] of this.peers) {
      if (!others.has(userId)) this.dropPeer(userId, peer);
    }

    for (const userId of others) {
      if (this.peers.has(userId)) continue;
      const peer = this.createPeer(userId);
      if (!peer.polite) void this.negotiate(userId, peer);
    }
  }

  /** Regla estable para decidir quién ofrece: evita ofertas cruzadas. */
  private isInitiator(peerId: string) {
    return this.options.selfId < peerId;
  }

  private createPeer(userId: string): Peer {
    rtcLog(`creando conexión con ${userId}`);
    const pc = new RTCPeerConnection({ iceServers: this.options.iceServers });

    // Las dos m-lines quedan reservadas desde la primera oferta, con o sin
    // cámara: es lo que permite pasar de audio a vídeo sin renegociar.
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    const peer: Peer = {
      pc,
      audioSender: audioTransceiver.sender,
      videoSender: videoTransceiver.sender,
      remoteAudio: new MediaStream(),
      remoteVideo: new MediaStream(),
      polite: !this.isInitiator(userId),
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      negotiated: false,
      hasRemoteVideo: false,
      pendingCandidates: [],
    };
    this.peers.set(userId, peer);

    if (this.audioTrack) this.attach(userId, peer.audioSender, this.audioTrack, 'audio');
    if (this.videoTrack) this.attach(userId, peer.videoSender, this.videoTrack, 'video');

    pc.onicecandidate = (event) => {
      if (event.candidate) this.send(userId, { type: 'candidate', candidate: event.candidate.toJSON() });
    };

    pc.onnegotiationneeded = () => {
      if (!peer.negotiated) return;
      rtcLog(`renegociación necesaria con ${userId}`);
      void this.negotiate(userId, peer);
    };

    pc.ontrack = (event) => this.receiveTrack(userId, peer, event);

    pc.oniceconnectionstatechange = () => {
      rtcLog(`ICE con ${userId}: ${pc.iceConnectionState}`);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      rtcLog(`conexión con ${userId}: ${state}`);
      this.options.onConnectionState?.(userId, state);
      if (state !== 'failed') return;

      this.options.onFailure?.(userId);
      // Un reinicio de ICE recupera la ruta sin rehacer la sesión: conserva
      // las pistas y no vuelve a pedir permisos de cámara ni micrófono.
      if (!peer.polite) {
        rtcLog(`reiniciando ICE con ${userId}`);
        pc.restartIce();
      }
    };

    return peer;
  }

  /**
   * Las pistas remotas se reparten en dos streams propios de la malla, uno de
   * audio y otro de vídeo. Separarlos es lo que permite que la conversación se
   * oiga aunque no haya imagen: el elemento de vídeo se puede ocultar, silenciar
   * o no llegar a reproducirse sin dejar la llamada muda.
   *
   * `event.streams` viene vacío porque los senders se crean con
   * `addTransceiver` y no llevan identificador de stream, así que la agrupación
   * la hace la malla y no el navegador.
   */
  private receiveTrack(userId: string, peer: Peer, event: RTCTrackEvent) {
    const track = event.track;
    rtcLog(`pista remota recibida de ${userId}: ${track.kind}`);

    if (track.kind === 'audio') {
      if (!peer.remoteAudio.getTracks().includes(track)) peer.remoteAudio.addTrack(track);
      track.addEventListener('ended', () => peer.remoteAudio.removeTrack(track));
      this.options.onRemoteAudio(userId, peer.remoteAudio);
      return;
    }

    if (!peer.remoteVideo.getTracks().includes(track)) peer.remoteVideo.addTrack(track);
    this.options.onRemoteStream(userId, peer.remoteVideo);

    // Una pista de vídeo llega silenciada y se «desmutea» cuando empieza a
    // fluir; al apagar la cámara vuelve a silenciarse sin renegociar. Es la
    // señal correcta para decidir si hay imagen que mostrar.
    const update = () => {
      const hasVideo = peer.remoteVideo
        .getVideoTracks()
        .some((item) => item.readyState === 'live' && !item.muted);
      if (hasVideo === peer.hasRemoteVideo) return;
      peer.hasRemoteVideo = hasVideo;
      rtcLog(`vídeo remoto de ${userId}: ${hasVideo ? 'disponible' : 'sin imagen'}`);
      this.options.onRemoteVideo(userId, hasVideo);
    };

    track.addEventListener('mute', update);
    track.addEventListener('unmute', update);
    track.addEventListener('ended', () => {
      peer.remoteVideo.removeTrack(track);
      update();
    });
    update();
  }

  private async negotiate(userId: string, peer: Peer) {
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      rtcLog(`oferta enviada a ${userId}`);
      this.send(userId, { type: 'offer', sdp: peer.pc.localDescription?.sdp ?? '' });
    } catch (err) {
      rtcWarn(`no se pudo ofertar a ${userId}`, err);
    } finally {
      peer.makingOffer = false;
    }
  }

  async handleSignal(payload: RtcSignalPayload) {
    if (this.closed) return;
    const from = payload.from;
    if (!from) return;
    if (payload.scope.id !== this.options.scope.id) return;
    if (payload.scope.kind !== this.options.scope.kind) return;

    let peer = this.peers.get(from);
    if (!peer) peer = this.createPeer(from);
    const { pc } = peer;
    const signal = payload.signal;

    try {
      if (signal.type === 'offer' || signal.type === 'answer') {
        const readyForOffer =
          !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingRemoteAnswer);
        const collision = signal.type === 'offer' && !readyForOffer;

        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) {
          rtcLog(`oferta de ${from} descartada por colisión`);
          return;
        }

        peer.settingRemoteAnswer = signal.type === 'answer';
        await pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
        peer.settingRemoteAnswer = false;
        rtcLog(`descripción remota de ${from} aplicada (${signal.type})`);
        await this.drainCandidates(from, peer);

        if (signal.type === 'offer') {
          await pc.setLocalDescription();
          this.send(from, { type: 'answer', sdp: pc.localDescription?.sdp ?? '' });
          rtcLog(`respuesta enviada a ${from}`);
        }
        peer.negotiated = true;
        return;
      }

      if (signal.type === 'candidate') {
        const candidate = signal.candidate as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else peer.pendingCandidates.push(candidate);
      }
    } catch (err) {
      if (!peer.ignoreOffer) rtcWarn(`señal de ${from} descartada`, err);
    }
  }

  private async drainCandidates(userId: string, peer: Peer) {
    if (peer.pendingCandidates.length === 0) return;
    const queue = peer.pendingCandidates;
    peer.pendingCandidates = [];
    rtcLog(`aplicando ${queue.length} candidatos en espera de ${userId}`);
    for (const candidate of queue) {
      await peer.pc.addIceCandidate(candidate).catch((err) => rtcWarn('candidato inservible', err));
    }
  }

  private send(to: string, signal: RtcSignal) {
    getSocket()?.emit('rtc:signal', { scope: this.options.scope, to, signal });
  }

  /**
   * Cierra un peer y suelta todo lo suyo. Las pistas locales no se tocan: son
   * del store, que las comparte con los demás peers y con la vista previa.
   */
  private dropPeer(userId: string, peer: Peer) {
    rtcLog(`cerrando conexión con ${userId}`);
    peer.pc.onicecandidate = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.ontrack = null;
    peer.pc.oniceconnectionstatechange = null;
    peer.pc.onconnectionstatechange = null;
    for (const track of peer.remoteAudio.getTracks()) peer.remoteAudio.removeTrack(track);
    for (const track of peer.remoteVideo.getTracks()) peer.remoteVideo.removeTrack(track);
    peer.pendingCandidates = [];
    peer.pc.close();
    this.peers.delete(userId);
    this.options.onPeerClosed(userId);
  }

  close() {
    this.closed = true;
    for (const [userId, peer] of [...this.peers]) this.dropPeer(userId, peer);
    this.peers.clear();
    this.audioTrack = null;
    this.videoTrack = null;
  }
}

/* --------------------------------- Medios ---------------------------------- */

/** Traduce los errores de `getUserMedia` a algo que el usuario entienda. */
export function mediaErrorMessage(err: unknown, kind: 'micrófono' | 'cámara' | 'medios') {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Necesitamos permiso para usar la ${kind === 'medios' ? 'cámara y el micrófono' : kind}`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No se ha encontrado ${kind === 'medios' ? 'ningún dispositivo' : `la ${kind}`}`;
    case 'NotReadableError':
      return `Otra aplicación está usando la ${kind}`;
    default:
      return err instanceof Error && err.message ? err.message : 'No se pudo acceder a tus dispositivos';
  }
}

/** Pide micrófono (y cámara) con mensajes de error comprensibles. */
export async function requestMedia(video: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no permite llamadas');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? videoConstraints() : false,
    });
    rtcLog('medios locales concedidos', stream.getTracks().map((track) => track.kind));
    return stream;
  } catch (err) {
    rtcWarn('getUserMedia falló', err);
    throw new Error(mediaErrorMessage(err, video ? 'medios' : 'micrófono'));
  }
}

export function videoConstraints(facingMode?: 'user' | 'environment'): MediaTrackConstraints {
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(facingMode ? { facingMode } : {}),
  };
}

export async function requestCamera(facingMode: 'user' | 'environment'): Promise<MediaStreamTrack> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(facingMode) });
    const [track] = stream.getVideoTracks();
    if (!track) throw new Error('Este dispositivo no tiene cámara');
    return track;
  } catch (err) {
    rtcWarn('no se pudo abrir la cámara', err);
    throw new Error(mediaErrorMessage(err, 'cámara'));
  }
}

/** ¿Hay más de una cámara? Habilita el botón de cambiar de cámara. */
export async function hasMultipleCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput').length > 1;
  } catch {
    return false;
  }
}

export function screenSharingSupported() {
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

/** Cancelar el diálogo del navegador lanza este error y no se reporta. */
export class ScreenShareCancelled extends Error {
  constructor() {
    super('Compartir pantalla cancelado');
    this.name = 'ScreenShareCancelled';
  }
}

export async function requestScreen(): Promise<MediaStream> {
  if (!screenSharingSupported()) throw new Error('Este navegador no permite compartir pantalla');
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    rtcLog('captura de pantalla concedida');
    return stream;
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') throw new ScreenShareCancelled();
    rtcWarn('getDisplayMedia falló', err);
    throw new Error('No se pudo compartir la pantalla');
  }
}
