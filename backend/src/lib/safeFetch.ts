import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Peticiones salientes hacia direcciones que da el usuario.
 *
 * Un servidor que descarga cualquier URL que le pasen es una puerta a la red
 * interna: basta pedirle `http://169.254.169.254/` para leer las credenciales
 * de la nube. Aquí se resuelve el nombre antes de salir y se rechaza todo lo
 * que no sea una dirección pública, en cada salto de la redirección.
 *
 * Queda una ventana estrecha entre la comprobación y la conexión (el nombre
 * podría resolver a otra cosa en ese instante). Cerrarla exige fijar la IP en
 * el socket, que rompe el certificado TLS; con destinos ya filtrados y un
 * servicio de diez personas, no compensa. Si esto crece, el camino es un
 * agente HTTP propio con `lookup` fijado.
 */

const BLOCKED_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
  /^198\.(1[89])\./,
  /^224\./,
  /^24[0-9]\./,
  /^25[0-5]\./,
];

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return BLOCKED_V4.some((pattern) => pattern.test(address));
  if (version === 6) {
    const value = address.toLowerCase();
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('fe80')) return true; // enlace local
    if (/^f[cd]/.test(value)) return true; // única local
    // IPv4 empotrada. Puede llegar en decimal (::ffff:10.0.0.1) o, si el
    // analizador de URL ya la normalizó, en hexadecimal (::ffff:a00:1).
    const dotted = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);

    const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = Number.parseInt(hex[1], 16);
      const low = Number.parseInt(hex[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return false;
  }
  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message = 'Dirección no permitida') {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** Acepta la URL solo si es http(s) y apunta fuera de la red privada. */
export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('La dirección no es válida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Solo se admiten enlaces http o https');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError();
    return url;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError('No se pudo resolver el dominio');
  }
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new UnsafeUrlError();
  }
  return url;
}

interface SafeFetchOptions {
  /** Corta la descarga en cuanto se pasa de este tamaño. */
  maxBytes: number;
  timeoutMs?: number;
  accept?: string;
  maxRedirects?: number;
  /**
   * Corta en cuanto aparece este texto. Para una vista previa solo hace falta
   * la cabecera del documento: sin esto, una página larga se descargaría
   * entera para leer cuatro etiquetas.
   */
  stopAfter?: string;
}

export interface SafeResponse {
  url: string;
  contentType: string;
  body: Buffer;
}

/** Descarga con límite de tamaño, de tiempo y de saltos, validando cada uno. */
export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<SafeResponse> {
  const { maxBytes, timeoutMs = 6000, accept, maxRedirects = 3, stopAfter } = options;
  let target = raw;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const url = await assertPublicUrl(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Sin un agente reconocible, muchos sitios no devuelven las etiquetas.
          'user-agent': 'KyroBot/1.0 (+vista previa de enlaces)',
          ...(accept ? { accept } : {}),
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new UnsafeUrlError('Redirección incompleta');
        target = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new UnsafeUrlError(`El servidor respondió ${response.status}`);

      const declared = Number(response.headers.get('content-length') ?? 0);
      if (!stopAfter && declared > maxBytes) {
        throw new UnsafeUrlError('El contenido es demasiado grande');
      }

      const body = await readCapped(response, maxBytes, stopAfter);
      return {
        url: url.toString(),
        contentType: response.headers.get('content-type')?.split(';')[0]?.trim() ?? '',
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new UnsafeUrlError('Demasiadas redirecciones');
}

/** Lee el cuerpo por trozos: para al llegar al marcador o al límite. */
async function readCapped(response: Response, maxBytes: number, stopAfter?: string) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      // Con marcador, quedarse con lo leído es correcto: es una descarga
      // parcial buscada, no un contenido que se salga de lo admitido.
      if (stopAfter) break;
      throw new UnsafeUrlError('El contenido es demasiado grande');
    }
    chunks.push(Buffer.from(value));

    if (stopAfter && Buffer.concat(chunks.slice(-2)).toString('utf8').includes(stopAfter)) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks);
}
