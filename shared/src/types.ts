/**
 * Modelo de dominio de KYRO.
 *
 * Idea central: todo lugar donde se puede hablar es una "conversación".
 * Un chat privado, un grupo y un canal de comunidad comparten el mismo
 * contrato — cambia el contexto, no el sistema.
 */

export type ID = string;
export type ISODate = string;

/* ---------------------------------- Usuario -------------------------------- */

export type PresenceStatus = 'available' | 'away' | 'dnd' | 'invisible' | 'offline';

export interface CustomStatus {
  emoji: string | null;
  text: string | null;
  expiresAt: ISODate | null;
}

/** Actividad en curso (juego, música, trabajo…). Se muestra de forma discreta. */
export interface UserActivity {
  kind: 'gaming' | 'music' | 'working' | 'studying' | 'custom';
  name: string;
  details: string | null;
  startedAt: ISODate;
}

export interface PublicUser {
  id: ID;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  accentColor: string | null;
  status: PresenceStatus;
  customStatus: CustomStatus | null;
  activity: UserActivity | null;
  lastSeenAt: ISODate | null;
  createdAt: ISODate;
}

export interface CurrentUser extends PublicUser {
  email: string;
  onboardedAt: ISODate | null;
  preferences: UserPreferences;
}

export interface UserPreferences {
  notifications: {
    messages: boolean;
    mentions: boolean;
    communities: boolean;
    calls: boolean;
    sounds: boolean;
  };
  reducedMotion: boolean;
  enterToSend: boolean;
}

/* ---------------------------------- Contactos ------------------------------ */

export type ContactStatus = 'pending' | 'accepted' | 'blocked';

export interface Contact {
  id: ID;
  user: PublicUser;
  status: ContactStatus;
  /** true si la solicitud la envió el usuario actual */
  outgoing: boolean;
  createdAt: ISODate;
}

/* -------------------------------- Conversación ----------------------------- */

export type ConversationType = 'direct' | 'group' | 'channel';
export type ChannelKind = 'text' | 'announcement';
export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface ConversationMember {
  userId: ID;
  role: MemberRole;
  joinedAt: ISODate;
  lastReadAt: ISODate | null;
  user: PublicUser;
}

export interface Conversation {
  id: ID;
  type: ConversationType;
  /** Presente solo cuando la conversación es un canal de comunidad. */
  communityId: ID | null;
  channelKind: ChannelKind | null;
  name: string | null;
  topic: string | null;
  avatarUrl: string | null;
  createdAt: ISODate;
  lastMessageAt: ISODate | null;
  /** Datos calculados para el usuario que consulta. */
  unreadCount: number;
  muted: boolean;
  pinned: boolean;
  myRole: MemberRole;
  memberCount: number;
  members: PublicUser[];
  lastMessage: MessagePreview | null;
}

export interface MessagePreview {
  id: ID;
  authorId: ID;
  authorName: string;
  content: string;
  type: MessageType;
  attachmentCount: number;
  createdAt: ISODate;
  deletedAt: ISODate | null;
}

/* ---------------------------------- Mensajes ------------------------------- */

export type MessageType = 'text' | 'system' | 'call';
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface Attachment {
  id: ID;
  kind: AttachmentKind;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: ID[];
  reacted: boolean;
}

export interface Message {
  id: ID;
  conversationId: ID;
  author: PublicUser | null;
  content: string;
  type: MessageType;
  /** Metadatos para mensajes de sistema y de llamada. */
  meta: Record<string, unknown> | null;
  attachments: Attachment[];
  reactions: Reaction[];
  replyTo: MessageReplyRef | null;
  mentions: ID[];
  editedAt: ISODate | null;
  deletedAt: ISODate | null;
  pinnedAt: ISODate | null;
  saved: boolean;
  createdAt: ISODate;
  /** Estado de lectura calculado (para mensajes propios). */
  readBy: ID[];
}

export interface MessageReplyRef {
  id: ID;
  content: string;
  authorId: ID;
  authorName: string;
  deletedAt: ISODate | null;
  attachmentCount: number;
}

/* -------------------------------- Comunidades ------------------------------ */

export interface Community {
  id: ID;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  isPublic: boolean;
  memberCount: number;
  onlineCount: number;
  ownerId: ID;
  createdAt: ISODate;
  /** Relativo al usuario que consulta */
  myRole: MemberRole | null;
  muted: boolean;
  inviteCode: string | null;
}

export interface CommunityDetail extends Community {
  channels: Conversation[];
  rooms: VoiceRoom[];
  events: CommunityEvent[];
}

export interface CommunityMember {
  user: PublicUser;
  role: MemberRole;
  nickname: string | null;
  joinedAt: ISODate;
}

/* ------------------------------- Voz y reuniones --------------------------- */

export type RoomKind = 'voice' | 'meeting' | 'gaming';

export interface VoiceRoom {
  id: ID;
  communityId: ID;
  name: string;
  kind: RoomKind;
  /** Juego o tema asociado (opcional, para salas de gaming). */
  topic: string | null;
  maxParticipants: number;
  participants: RoomParticipant[];
}

export interface RoomParticipant {
  user: PublicUser;
  muted: boolean;
  deafened: boolean;
  sharingScreen: boolean;
  camera: boolean;
  joinedAt: ISODate;
}

/* ---------------------------------- Eventos -------------------------------- */

export interface CommunityEvent {
  id: ID;
  communityId: ID;
  title: string;
  description: string | null;
  startsAt: ISODate;
  endsAt: ISODate | null;
  roomId: ID | null;
  channelId: ID | null;
  createdBy: ID;
  attendeeCount: number;
  attending: boolean;
}

/* ------------------------------- Notificaciones ---------------------------- */

export type NotificationType =
  | 'message'
  | 'mention'
  | 'invite'
  | 'contact_request'
  | 'announcement'
  | 'call'
  | 'activity'
  | 'event';

export interface AppNotification {
  id: ID;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Datos de navegación: conversationId, communityId, messageId… */
  data: Record<string, string> | null;
  actor: PublicUser | null;
  readAt: ISODate | null;
  createdAt: ISODate;
}

/* ---------------------------------- Llamadas ------------------------------- */

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'ongoing' | 'ended' | 'missed' | 'declined';

export interface Call {
  id: ID;
  conversationId: ID;
  kind: CallKind;
  status: CallStatus;
  initiator: PublicUser;
  participants: PublicUser[];
  startedAt: ISODate;
  endedAt: ISODate | null;
  durationMs: number | null;
}

/* ---------------------------------- Búsqueda ------------------------------- */

export interface SearchFileResult extends Attachment {
  conversationId: ID;
  messageId: ID;
  conversationName: string;
  createdAt: ISODate;
}

export interface SearchResults {
  people: PublicUser[];
  conversations: Conversation[];
  communities: Community[];
  channels: Conversation[];
  messages: Message[];
  files: SearchFileResult[];
}

/* ------------------------------- Utilidades API ---------------------------- */

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface AuthResponse {
  user: CurrentUser;
  accessToken: string;
  expiresIn: number;
}
