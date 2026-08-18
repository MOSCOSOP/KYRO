import type { ApiErrorBody, AuthResponse } from '@kyro/shared';

/**
 * Cliente HTTP de KYRO.
 *
 * - El token de acceso vive en memoria (nunca en localStorage).
 * - La sesión se mantiene con una cookie httpOnly de refresco: si una petición
 *   devuelve 401, se renueva una sola vez y se reintenta.
 * - Ningún componente construye URLs ni maneja cabeceras: todo pasa por aquí.
 */

/**
 * Origen del backend. Vacío en desarrollo y cuando el API se sirve desde el
 * mismo dominio (se usan rutas relativas); en despliegues separados —por
 * ejemplo el frontend en Vercel— se configura con `VITE_API_URL`.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const BASE = `${API_ORIGIN}/api`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Errores que el usuario puede resolver (frente a fallos del servidor). */
  get isUserFacing() {
    return this.status < 500;
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Se llama cuando la sesión ya no se puede renovar. */
export function onSessionExpired(callback: () => void) {
  onSessionLost = callback;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /** Evita el ciclo de renovación (se usa en el propio /auth/refresh). */
  skipRefresh?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) return false;
        const data = (await response.json()) as AuthResponse;
        accessToken = data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        // Se libera en el siguiente tick para que las peticiones en paralelo
        // compartan el mismo intento.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

async function parseError(response: Response) {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  return new ApiError(
    response.status,
    body?.error?.code ?? 'http_error',
    body?.error?.message ?? 'No se pudo completar la operación',
    body?.error?.details,
  );
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      signal: options.signal,
      body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'Sin conexión con el servidor');
  }

  if (response.status === 401 && !options.skipRefresh) {
    const renewed = await refreshSession();
    if (renewed) {
      response = await send();
    } else {
      accessToken = null;
      onSessionLost?.();
      throw await parseError(response);
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Subida de archivos con progreso. Usa XMLHttpRequest porque `fetch` todavía
 * no informa del progreso de subida en todos los navegadores.
 */
export function uploadFile(
  file: File,
  options: {
    scope?: 'message' | 'avatar' | 'community';
    width?: number;
    height?: number;
    durationMs?: number;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ token: string; attachment: import('@kyro/shared').Attachment }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('scope', options.scope ?? 'message');
    if (options.width) form.append('width', String(options.width));
    if (options.height) form.append('height', String(options.height));
    if (options.durationMs) form.append('durationMs', String(options.durationMs));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/uploads`);
    xhr.withCredentials = true;
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else {
          reject(
            new ApiError(
              xhr.status,
              data?.error?.code ?? 'upload_error',
              data?.error?.message ?? 'No se pudo subir el archivo',
            ),
          );
        }
      } catch {
        reject(new ApiError(xhr.status, 'upload_error', 'No se pudo subir el archivo'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Sin conexión con el servidor'));
    xhr.onabort = () => reject(new DOMException('Subida cancelada', 'AbortError'));

    options.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}
