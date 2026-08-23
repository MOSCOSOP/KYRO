# KYRO

**Conecta. Habla. Pertenece.**

KYRO es un espacio donde las conversaciones, comunidades y encuentros viven juntos.
Un chat privado, un grupo y una comunidad con canales y salas de voz son la misma
aplicación: el mismo mensaje, el mismo buscador, la misma forma de trabajar.

---

## Puesta en marcha

Requisitos: **Node.js 20 o superior**. Nada más.

```bash
npm install          # instala las dependencias del monorepo
npm run db:setup     # crea la base de datos y genera el cliente de Prisma
npm run db:seed      # opcional: datos de ejemplo para mirar alrededor
npm run dev          # backend en :4000 y frontend en :5173
```

Abre <http://localhost:5173>.

Sin configurar nada, KYRO arranca con **SQLite**, almacenamiento **en disco** y estado
efímero **en memoria**. Es suficiente para desarrollar y probarlo todo, incluidas las
llamadas y las salas de voz.

### Cuentas de ejemplo

`npm run db:seed` crea cinco cuentas con la contraseña `kyro1234`:
`alex`, `maria`, `diego`, `lucia`, `sam`. Son cuentas reales creadas con los mismos
servicios que usa la aplicación: no hay datos falsos simulando funcionalidades.

### Si `npm run dev` falla en tu equipo

En algunos Windows el `PATH` del sistema está incompleto y los scripts de npm no
encuentran `node`/`npm` al lanzarse. Mientras lo arreglas, puedes levantar cada parte
a mano desde la raíz del proyecto:

```bash
node node_modules/typescript/bin/tsc -p shared/tsconfig.json   # compila @kyro/shared
cd backend  && node ../node_modules/tsx/dist/cli.mjs src/index.ts
cd frontend && node ../node_modules/vite/bin/vite.js
```

## Producción

La misma base de código usa PostgreSQL, Redis y almacenamiento compatible con S3 en
cuanto se lo dices por variables de entorno. Copia `backend/.env.example` a
`backend/.env` y ajusta:

```env
DATABASE_URL=postgresql://kyro:kyro@localhost:5432/kyro?schema=public
REDIS_URL=redis://localhost:6379
STORAGE_DRIVER=s3
JWT_SECRET=...            # obligatorio: el servidor no arranca con los de desarrollo
JWT_REFRESH_SECRET=...
```

Para levantar esa infraestructura en local hay un `docker-compose.yml` con PostgreSQL,
Redis y MinIO:

```bash
docker compose up -d
npm run db:setup
```

Con `REDIS_URL` configurado, el servidor puede escalar a varias instancias: la
presencia, las salas de voz y todos los eventos viajan por Redis pub/sub.

## Despliegue

**El frontend en Vercel.** El repositorio ya trae `vercel.json`: Vercel compila
`shared` y `frontend` y publica `frontend/dist` como aplicación de una sola página.

Importa el repo **desde la raíz**, no desde `/frontend` ni `/backend`. En el asistente:
preset **Other** (no Services), Root Directory vacío. Si eliges una subcarpeta, npm
responde `No workspaces found` y el botón de deploy se queda bloqueado o el build falla.

Solo hay que añadir una variable de entorno en el proyecto:

```env
VITE_API_URL=https://tu-backend.example.com
```

Sin esa variable el frontend usa rutas relativas, que es lo correcto cuando backend y
frontend comparten dominio.

**El backend, no en Vercel.** KYRO mantiene conexiones WebSocket abiertas y procesos de
larga vida (presencia, salas de voz, señalización WebRTC); las funciones serverless de
Vercel no sirven para eso. El backend va en un servicio con procesos persistentes
—Railway, Render, Fly.io, una VM— con:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...        # Neon, Supabase, Railway…
REDIS_URL=redis://...                # opcional, necesario con varias instancias
STORAGE_DRIVER=s3                    # con S3, R2 o Spaces
JWT_SECRET=...                       # secretos propios: si no, no arranca
JWT_REFRESH_SECRET=...
PUBLIC_URL=https://tu-backend.example.com
CORS_ORIGINS=https://tu-frontend.vercel.app
```

Arranque: `npm install && npm run build && npm run db:setup && npm run start`.

Si el frontend y el backend quedan en **dominios distintos** (lo normal con Vercel),
añade también `CROSS_SITE_COOKIES=true` en el backend: la cookie de sesión pasa a
`SameSite=None; Secure`, que es lo que exige el navegador para enviarla entre dominios.
Requiere HTTPS en el backend. Bajo un mismo dominio no hace falta y la cookie se queda
en `strict`, que es más seguro.

### El backend en Railway

El repositorio trae `railway.json`: Railway compila `shared` y `backend`, genera el
cliente de Prisma, sincroniza el esquema al arrancar y expone `/api/health` como
comprobación de salud. El servicio se crea sobre la **raíz del repositorio** (es un
monorepo con workspaces de npm), no sobre `backend/`.

1. Crea el proyecto y añade una base de datos **PostgreSQL** desde el panel o con
   `railway add --database postgres`.
2. Configura las variables del servicio del backend:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_URL=https://tu-backend.up.railway.app
CORS_ORIGINS=https://tu-frontend.vercel.app
CROSS_SITE_COOKIES=true
JWT_SECRET=...
JWT_REFRESH_SECRET=...
NPM_CONFIG_PRODUCTION=false          # con NODE_ENV=production npm omitiría tsc y prisma
NIXPACKS_NO_PRUNE=1                  # prisma se usa también al arrancar
```

3. Genera un dominio público para el servicio y pon esa URL en `PUBLIC_URL` y en la
   variable `VITE_API_URL` del proyecto de Vercel. `CORS_ORIGINS` tiene que llevar el
   dominio exacto del frontend, sin barra final.

`PORT` lo inyecta Railway y el servidor lo respeta. Redis es opcional: añade el plugin y
`REDIS_URL=${{Redis.REDIS_URL}}` solo cuando quieras más de una instancia.

**Archivos subidos.** El disco de un contenedor es efímero: con `STORAGE_DRIVER=local`
las subidas desaparecen en cada despliegue. Monta un volumen en `/app/backend/storage` y
pon `STORAGE_LOCAL_DIR=/app/backend/storage`, o usa `STORAGE_DRIVER=s3` con S3, R2 o
Spaces.

---

## Arquitectura

```
kyro/
├── shared/      Contrato común: tipos, eventos de WebSocket, límites, permisos
├── backend/     Node + TypeScript · Express · Socket.IO · Prisma
│   ├── prisma/           Esquema de datos
│   └── src/
│       ├── auth/         Contraseñas, tokens, middleware de sesión
│       ├── config/       Variables de entorno validadas
│       ├── modules/      Un módulo por dominio: rutas + servicio
│       ├── realtime/     Socket.IO, presencia, salas, señalización WebRTC
│       ├── serializers/  Fila de base de datos → contrato público
│       ├── storage/      Driver local o S3
│       └── middleware/   Errores, validación, rate limiting, logs
└── frontend/    React 18 + TypeScript + Vite
    └── src/
        ├── components/   Interfaz (ui, layout, chat, communities, calls, search)
        ├── store/        Estado y lógica de negocio (zustand)
        ├── lib/          Cliente HTTP, WebSocket, formato, utilidades
        ├── webrtc/       Malla de pares para llamadas y salas de voz
        ├── routes/       Pantallas
        └── styles/       Tokens de diseño
```

Dos decisiones sostienen todo lo demás:

**Una conversación es una conversación.** Chats privados, grupos y canales de
comunidad son el mismo modelo (`Conversation` con tipo `direct | group | channel`).
Por eso un grupo puede convertirse en comunidad conservando su historia: el grupo pasa
a ser el canal `general`. Y por eso el chat se comporta igual en todas partes.

**Los componentes no deciden nada.** La lógica vive en los servicios del backend y en
los stores del frontend. Un componente lee estado y llama a una acción.

### Tiempo real

Socket.IO en `/realtime`, autenticado con el token de acceso en el handshake. Toda
emisión pasa por un bus de mensajes: con Redis funciona entre instancias, sin Redis se
resuelve en el mismo proceso. El cliente reconecta solo y, al volver, se sincroniza.

### Llamadas y voz

WebRTC en malla punto a punto. El servidor solo enruta la señalización y comprueba que
las dos partes estén en el mismo espacio. Funciona bien en llamadas privadas y grupos
pequeños; para salas grandes habría que poner un SFU, y la señalización ya está
preparada para sustituirse sin tocar la interfaz.

### Pruebas

`npm test` levanta el backend contra una base de datos SQLite propia, creada
desde el esquema en cada ejecución. Cubre lo que no se ve romperse hasta que es
tarde: la rotación del token de refresco (incluida la carrera de dos pestañas
refrescando a la vez, y la detección de un token reutilizado), quién puede leer
y editar qué, y los destinos a los que el servidor tiene prohibido salir.

### Seguridad

- Contraseñas con **bcrypt** (12 rondas). Nunca se almacenan en texto plano.
- Acceso con **JWT corto** (15 min) + **refresh token opaco y rotatorio** en cookie
  `httpOnly`, con detección de reutilización: si un token revocado vuelve a usarse, se
  cierran todas las sesiones de esa cuenta.
- Validación de entrada con **zod** en cada endpoint y saneado de texto.
- **Rate limiting** por usuario o IP, más estricto en autenticación, escritura y subidas.
- Permisos y roles (`owner > admin > moderator > member`) comprobados **en el servidor**,
  no solo en la interfaz.
- Subidas con tipo y tamaño verificados; los archivos se sirven inertes
  (`Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`) y los SVG
  fuera de mensajes se guardan como descarga.
- El texto de los mensajes se renderiza como texto: nunca se inyecta HTML.
- Cabeceras de seguridad con **helmet**, CORS restringido a los orígenes configurados y
  cookies `sameSite=strict` en producción.

---

## Qué hay hecho

Mensajería completa: mensajes de texto, emojis, respuestas con referencia visual,
reacciones, menciones (`@usuario` y `@everyone` para el equipo), edición, borrado,
mensajes fijados, mensajes guardados, búsqueda dentro de la conversación y búsqueda
global (`Ctrl/⌘ + K`) sobre personas, conversaciones, comunidades, canales, mensajes y
archivos.

Archivos: imágenes, vídeo, audio y documentos con previsualización, progreso de subida,
arrastrar y soltar, pegar desde el portapapeles, y paneles de fotos, archivos y enlaces
por conversación.

Tiempo real: entrega instantánea, «escribiendo…», enviado/leído, presencia
(disponible, ausente, no molestar, invisible), estado personalizado y actividad,
notificaciones y contador de no leídos.

Comunidades: canales de texto y de anuncios, salas de voz, reuniones, salas de gaming,
eventos con asistentes, invitaciones por código o directas, roles y moderación.

Continuidad: un chat privado se convierte en grupo y un grupo en comunidad sin perder
un solo mensaje.

Llamadas: llamada de voz, videollamada y pantalla compartida en conversaciones;
salas de voz con silenciar, ensordecer y compartir pantalla en comunidades; historial
de llamadas.

Producto: estados de carga y esqueletos, estados vacíos, errores comprensibles,
confirmaciones para lo irreversible, avisos, aviso de reconexión, paginación e
scroll infinito, imágenes diferidas, atajos de teclado y navegación accesible.

Identidad y producto: paleta de comandos con acciones (`Ctrl/⌘ + K`), perfil
flotante desde cualquier persona, presencia por contexto («en una llamada» la
publica el servidor), conexión rápida escribiendo `@usuario`, modo llamada con
controles que se apartan solos e indicador de quién habla, privacidad aplicada
en el servidor, avisos del sistema y sonido, dos profundidades de tema, color
propio de cada persona y de cada comunidad, y PWA instalable.

Enlaces: un enlace suelto en un mensaje se acompaña de su vista previa (sitio,
título, descripción e imagen). El servidor resuelve el dominio antes de salir y
rechaza cualquier destino de la red privada, y la imagen se sirve desde KYRO
—firmada— para no revelar la IP de quien lee el mensaje.

Móvil: pulsación larga para las acciones de un mensaje y arrastrar hacia la
derecha para responder. Ninguna interacción depende de pasar el ratón por
encima.

## Qué está preparado pero todavía no implementado

Se dice claramente en lugar de simularlo:

- **Bots e integraciones.** No hay API pública ni webhooks todavía.
- **Grabación de llamadas y SFU.** La malla WebRTC sirve para grupos pequeños
  (hasta unas ocho personas); por encima haría falta un servidor de mezcla.
- **Mensajes cifrados de extremo a extremo.** Hoy el cifrado es en tránsito
  (HTTPS/WSS): el servidor puede leer los mensajes, como en cualquier plataforma
  que ofrezca búsqueda del historial.
- **Aplicaciones de escritorio y móvil.** Por ahora es web instalable (PWA); la
  interfaz se adapta de 320 px a 4K y la arquitectura está separada para
  empaquetarla más adelante.
- **Traducciones.** La interfaz está en español; los textos están centralizados en los
  componentes, sin librería de i18n aún.

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Backend y frontend en modo desarrollo |
| `npm run build` | Compila `shared`, `backend` y `frontend` |
| `npm run start` | Arranca el backend compilado |
| `npm run typecheck` | Comprueba los tipos de los tres paquetes |
| `npm test` | Pruebas del backend (sesión, permisos y destinos de salida) |
| `npm run db:setup` | Sincroniza el esquema y genera el cliente de Prisma |
| `npm run db:seed` | Datos de ejemplo |
| `npm run db:studio -w backend` | Prisma Studio |

## La marca

Todo lo que nombra al producto sale de `frontend/src/config/brand.ts` (y el favicon de
`frontend/public/favicon.svg`). Cambiar la identidad es cambiar ese archivo.
