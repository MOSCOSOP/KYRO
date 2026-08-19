/**
 * KYRO · service worker.
 *
 * Hace una sola cosa y la hace bien: que la aplicación abra rápido y que, sin
 * red, aparezca KYRO diciendo la verdad en lugar del error del navegador.
 *
 * Lo que NUNCA hace: guardar mensajes, llamadas ni nada del API. Si no hay
 * conexión, la aplicación lo dice; no finge que funciona.
 */

const VERSION = 'kyro-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // El API, el tiempo real y los archivos subidos nunca se guardan.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/realtime') ||
    url.pathname.startsWith('/uploads')
  ) {
    return;
  }

  // Navegación: siempre red primero; el caché solo evita la pantalla de error.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Recursos con huella en el nombre: del caché y se refrescan por detrás.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(ASSETS).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());

      return cached ?? network;
    }),
  );
});
