/**
 * Datos de ejemplo para explorar KYRO en local.
 *
 * Es OPCIONAL y se ejecuta a mano (`npm run db:seed`). No se usa en producción
 * ni sustituye a ninguna funcionalidad: son cuentas y conversaciones reales
 * creadas con los mismos servicios que usa la aplicación.
 *
 * Todas las cuentas de ejemplo comparten la contraseña `kyro1234`.
 */
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../auth/password.js';
import { logger } from '../lib/logger.js';
import { createGroup, openDirectConversation } from '../modules/conversations/service.js';
import { createMessage } from '../modules/messages/service.js';
import {
  createChannel,
  createCommunity,
  createEvent,
  joinCommunity,
} from '../modules/communities/service.js';

const PASSWORD = 'kyro1234';

interface SeedUser {
  username: string;
  displayName: string;
  bio: string;
  status: string;
}

const PEOPLE: SeedUser[] = [
  { username: 'alex', displayName: 'Alex Rivera', bio: 'Diseño de producto y café.', status: 'available' },
  { username: 'maria', displayName: 'María Fuentes', bio: 'Frontend. Me gustan las cosas rápidas.', status: 'available' },
  { username: 'diego', displayName: 'Diego Salas', bio: 'Backend y servidores felices.', status: 'dnd' },
  { username: 'lucia', displayName: 'Lucía Ortega', bio: 'Comunidad y eventos.', status: 'away' },
  { username: 'sam', displayName: 'Sam Quiroz', bio: 'Gaming casi profesional.', status: 'available' },
];

async function ensureUser(person: SeedUser) {
  const existing = await prisma.user.findUnique({ where: { username: person.username } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email: `${person.username}@kyro.local`,
      username: person.username,
      displayName: person.displayName,
      bio: person.bio,
      status: person.status,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
}

async function send(conversationId: string, authorId: string, content: string) {
  await createMessage({ conversationId, authorId, content });
}

async function main() {
  const users = new Map<string, { id: string }>();
  for (const person of PEOPLE) {
    users.set(person.username, await ensureUser(person));
  }

  const alex = users.get('alex')!;
  const maria = users.get('maria')!;
  const diego = users.get('diego')!;
  const lucia = users.get('lucia')!;
  const sam = users.get('sam')!;

  // Contactos aceptados entre todos, para que la búsqueda tenga sentido.
  for (const person of PEOPLE.slice(1)) {
    const other = users.get(person.username)!;
    const exists = await prisma.contact.findFirst({
      where: {
        OR: [
          { requesterId: alex.id, addresseeId: other.id },
          { requesterId: other.id, addresseeId: alex.id },
        ],
      },
    });
    if (!exists) {
      await prisma.contact.create({
        data: { requesterId: alex.id, addresseeId: other.id, status: 'accepted' },
      });
    }
  }

  const alreadySeeded = await prisma.conversation.count({ where: { type: 'group' } });
  if (alreadySeeded > 0) {
    logger.info('Los datos de ejemplo ya existen. Nada que hacer.');
    return;
  }

  /* --------------------------- Conversación directa ------------------------ */

  const direct = await openDirectConversation(alex.id, maria.id);
  await send(direct.id, maria.id, '¡Hola! ¿Viste el nuevo diseño?');
  await send(direct.id, alex.id, 'Sí, quedó mucho más limpio. Te paso notas en un rato.');
  await send(direct.id, maria.id, 'Perfecto. Si prefieres lo hablamos por voz.');

  /* -------------------------------- Grupo ---------------------------------- */

  const group = await createGroup(alex.id, {
    name: 'Equipo Producto',
    memberIds: [maria.id, diego.id, lucia.id],
    topic: 'Todo lo que estamos construyendo',
  });
  await send(group.id, diego.id, 'Subo el backend a staging esta tarde.');
  await send(group.id, lucia.id, 'Yo preparo el anuncio para la comunidad 🙌');
  await send(group.id, alex.id, 'Genial. Nos vemos en la reunión del jueves.');

  /* ------------------------------ Comunidad -------------------------------- */

  const community = await createCommunity(sam.id, {
    name: 'Gaming Perú',
    description: 'Partidas, clips y quedadas. Todos bienvenidos.',
    isPublic: true,
    accentColor: '#5B6CFF',
  });

  for (const member of [alex, maria, diego, lucia]) {
    await joinCommunity(member.id, { communityId: community.id });
  }

  await createChannel(community.id, sam.id, { name: 'clips', topic: 'Tus mejores jugadas' });
  await createChannel(community.id, sam.id, { name: 'ayuda', topic: 'Dudas técnicas y setup' });

  const channels = await prisma.conversation.findMany({
    where: { communityId: community.id, type: 'channel' },
    orderBy: { position: 'asc' },
  });
  const general = channels.find((channel) => channel.name === 'general');
  const anuncios = channels.find((channel) => channel.channelKind === 'announcement');

  if (general) {
    await send(general.id, sam.id, 'Bienvenidos a la comunidad. Preséntate cuando quieras 👋');
    await send(general.id, lucia.id, '¡Hola! Organizo las quedadas de los viernes.');
    await send(general.id, diego.id, '¿Alguien para ranked esta noche?');
  }
  if (anuncios) {
    await send(anuncios.id, sam.id, 'Este viernes torneo interno. Inscripciones abiertas.');
  }

  const rooms = await prisma.voiceRoom.findMany({ where: { communityId: community.id } });
  await createEvent(community.id, sam.id, {
    title: 'Torneo interno',
    description: 'Formato eliminación directa. Trae tu mejor setup.',
    startsAt: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
    endsAt: null,
    roomId: rooms[0]?.id ?? null,
    channelId: general?.id ?? null,
  });

  logger.info(
    { cuentas: PEOPLE.map((person) => person.username), contrasena: PASSWORD },
    'Datos de ejemplo creados',
  );
}

main()
  .catch((err) => {
    logger.error({ err }, 'No se pudieron crear los datos de ejemplo');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
