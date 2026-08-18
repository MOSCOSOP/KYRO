/** Utilidades de texto: saneado ligero y menciones. */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * El contenido se guarda como texto plano: el cliente nunca interpreta HTML.
 * Aun así se eliminan caracteres de control y se normalizan los saltos.
 */
export function sanitizeText(input: string, maxLength: number): string {
  return input
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

const MENTION_RE = /(?:^|[\s(])@([a-z0-9_.]{3,24})/gi;

export function extractMentionUsernames(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(MENTION_RE)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

export function mentionsEveryone(content: string): boolean {
  return /(?:^|\s)@(everyone|todos)\b/i.test(content);
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function excerpt(value: string, length = 120): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}
