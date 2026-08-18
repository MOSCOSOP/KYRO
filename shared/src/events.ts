/**
 * Contrato de eventos en tiempo real (WebSocket) entre cliente y servidor.
 * Un único canal para mensajes, presencia, salas de voz y señalización WebRTC.
 */

import type {
  AppNotification,
  Call,
  CallKind,
  Conversation,
  CustomStatus,
  ID,
  ISODate,
  Message,
  PresenceStatus,
  PublicUser,
  Reaction,
  RoomParticipant,
  UserActivity,
} from './types.js';

/* ------------------------------ Servidor → Cliente ------------------------- */

export interface ServerToClientEvents {
  'connection:ready': (payload: { userId: ID; serverTime: ISODate }) => void;

  'message:new': (payload: { message: Message; conversation: Conversation }) => void;
  'message:updated': (payload: { message: Message }) => void;
  'message:deleted': (payload: { conversationId: ID; messageId: ID; deletedAt: ISODate }) => void;
  'message:reaction': (payload: {
    conversationId: ID;
    messageId: ID;
    reactions: Reaction[];
  }) => void;
  'message:pinned': (payload: {
    conversationId: ID;
    messageId: ID;
    pinnedAt: ISODate | null;
  }) => void;

  'conversation:created': (payload: { conversation: Conversation }) => void;
  'conversation:updated': (payload: { conversation: Conversation }) => void;
  'conversation:removed': (payload: { conversationId: ID }) => void;
  'conversation:read': (payload: {
    conversationId: ID;
    userId: ID;
    lastReadAt: ISODate;
    unreadCount?: number;
  }) => void;
  'conversation:typing': (payload: {
    conversationId: ID;
    user: PublicUser;
    typing: boolean;
  }) => void;

  'presence:update': (payload: {
    userId: ID;
    status: PresenceStatus;
    customStatus: CustomStatus | null;
    activity: UserActivity | null;
    lastSeenAt: ISODate | null;
  }) => void;

  'notification:new': (payload: { notification: AppNotification; unreadCount: number }) => void;

  'room:state': (payload: { roomId: ID; participants: RoomParticipant[] }) => void;
  'room:peer-joined': (payload: { roomId: ID; participant: RoomParticipant }) => void;
  'room:peer-left': (payload: { roomId: ID; userId: ID }) => void;

  'call:incoming': (payload: { call: Call }) => void;
  'call:updated': (payload: { call: Call }) => void;
  'call:ended': (payload: { callId: ID; conversationId: ID; reason: string }) => void;

  /** Señalización WebRTC punto a punto (llamadas y salas). */
  'rtc:signal': (payload: RtcSignalPayload) => void;

  'error': (payload: { code: string; message: string }) => void;
}

/* ------------------------------ Cliente → Servidor ------------------------- */

export interface ClientToServerEvents {
  'conversation:subscribe': (payload: { conversationId: ID }) => void;
  'conversation:unsubscribe': (payload: { conversationId: ID }) => void;
  'conversation:typing': (payload: { conversationId: ID; typing: boolean }) => void;
  'conversation:read': (payload: { conversationId: ID; lastReadAt?: ISODate }) => void;

  'presence:set': (payload: {
    status?: PresenceStatus;
    customStatus?: CustomStatus | null;
    activity?: UserActivity | null;
  }) => void;
  'presence:heartbeat': () => void;

  'room:join': (payload: { roomId: ID }, ack?: (res: RoomJoinAck) => void) => void;
  'room:leave': (payload: { roomId: ID }) => void;
  'room:state-set': (payload: {
    roomId: ID;
    muted?: boolean;
    deafened?: boolean;
    sharingScreen?: boolean;
    camera?: boolean;
  }) => void;

  'call:start': (payload: { conversationId: ID; kind: CallKind }, ack?: (res: CallAck) => void) => void;
  'call:accept': (payload: { callId: ID }) => void;
  'call:decline': (payload: { callId: ID }) => void;
  'call:hangup': (payload: { callId: ID }) => void;

  'rtc:signal': (payload: RtcSignalPayload) => void;
}

export interface RtcSignalPayload {
  /** Sala de voz o llamada a la que pertenece la señal. */
  scope: { kind: 'room' | 'call'; id: ID };
  /** Usuario destino (el servidor solo enruta). */
  to: ID;
  from?: ID;
  signal: RtcSignal;
}

export type RtcSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: unknown }
  | { type: 'renegotiate' };

export interface RoomJoinAck {
  ok: boolean;
  error?: string;
  participants?: RoomParticipant[];
  iceServers?: RTCIceServerConfig[];
}

export interface CallAck {
  ok: boolean;
  error?: string;
  call?: Call;
  iceServers?: RTCIceServerConfig[];
}

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}
