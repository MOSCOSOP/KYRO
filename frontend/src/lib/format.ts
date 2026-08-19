import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import type { PresenceStatus } from '@kyro/shared';

/** Hora corta: 14:32 */
export function timeOf(iso: string) {
  return format(new Date(iso), 'HH:mm');
}

/** Etiqueta de un separador de días dentro de una conversación. */
export function dayLabel(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return 'Hoy';
  if (isYesterday(date)) return 'Ayer';
  if (isThisYear(date)) return format(date, "d 'de' MMMM", { locale: es });
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

/** Marca compacta para listas: 14:32 · ayer · 12 mar */
export function shortStamp(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ayer';
  if (isThisYear(date)) return format(date, 'd MMM', { locale: es });
  return format(date, 'dd/MM/yy');
}

/** "hace 3 minutos" */
export function relative(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: es });
}

export function fullStamp(iso: string) {
  return format(new Date(iso), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
}

export function eventStamp(iso: string) {
  const date = new Date(iso);
  const prefix = isToday(date) ? 'Hoy' : isYesterday(date) ? 'Ayer' : format(date, "EEE d MMM", { locale: es });
  return `${prefix} · ${format(date, 'HH:mm')}`;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function duration(ms: number) {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  available: 'Disponible',
  away: 'Ausente',
  dnd: 'No molestar',
  invisible: 'Invisible',
  offline: 'Desconectado',
};

export function lastSeenLabel(status: PresenceStatus, lastSeenAt: string | null) {
  if (status !== 'offline') return PRESENCE_LABEL[status];
  if (!lastSeenAt) return 'Desconectado';
  return `Últ. vez ${relative(lastSeenAt)}`;
}

/** Saludo de la pantalla de inicio, según la hora local. */
export function greeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 6) return `Buenas noches, ${name}`;
  if (hour < 13) return `Buenos días, ${name}`;
  if (hour < 20) return `Buenas tardes, ${name}`;
  return `Buenas noches, ${name}`;
}

/**
 * Lo que se muestra bajo el nombre de alguien. El contexto manda: si está en
 * una llamada o ha escrito un estado, eso dice más que "disponible".
 */
export function presenceLine(entry: {
  status: PresenceStatus;
  customStatus: { text: string | null; emoji: string | null } | null;
  activity: { name: string } | null;
  lastSeenAt: string | null;
}) {
  if (entry.activity?.name) return entry.activity.name;
  if (entry.customStatus?.text) {
    return entry.customStatus.emoji
      ? `${entry.customStatus.emoji} ${entry.customStatus.text}`
      : entry.customStatus.text;
  }
  return lastSeenLabel(entry.status, entry.lastSeenAt);
}
