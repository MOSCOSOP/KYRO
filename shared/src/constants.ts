/** Límites y constantes compartidas entre backend y frontend. */

export const LIMITS = {
  username: { min: 3, max: 24, pattern: /^[a-z0-9_.]+$/ },
  displayName: { min: 1, max: 40 },
  password: { min: 8, max: 128 },
  bio: { max: 280 },
  customStatus: { max: 60 },
  messageContent: { max: 4000 },
  conversationName: { max: 60 },
  communityName: { max: 50 },
  communityDescription: { max: 500 },
  channelName: { max: 40 },
  topic: { max: 200 },
  attachmentsPerMessage: 10,
  pageSize: 40,
} as const;

/** Tamaño máximo por archivo (bytes) según categoría. */
export const UPLOAD_LIMITS = {
  image: 12 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  file: 100 * 1024 * 1024,
} as const;

export const ALLOWED_MIME = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac'],
  file: [
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/octet-stream',
  ],
} as const;

export const TYPING_TIMEOUT_MS = 5000;
export const PRESENCE_TTL_SECONDS = 60;
export const PRESENCE_HEARTBEAT_MS = 20000;
