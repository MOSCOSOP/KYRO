import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { asUser, refreshCookieOf, server, signUp } from './helpers.js';

describe('registro y acceso', () => {
  it('crea la cuenta y devuelve sesión', async () => {
    const user = await signUp();
    expect(user.accessToken).toBeTruthy();
    expect(user.refreshCookie).toContain('kyro_rt=');
  });

  it('no admite dos veces el mismo usuario', async () => {
    const user = await signUp();
    await request(server())
      .post('/api/auth/register')
      .send({
        email: `otro-${user.username}@ejemplo.test`,
        username: user.username,
        password: 'otra-contrasena',
      })
      .expect(409);
  });

  it('rechaza la contraseña equivocada sin decir cuál falla', async () => {
    const user = await signUp();
    const response = await request(server())
      .post('/api/auth/login')
      .send({ identifier: user.username, password: 'no-es-esta' })
      .expect(401);
    expect(JSON.stringify(response.body)).not.toContain(user.email);
  });

  it('entra con el correo o con el usuario', async () => {
    const user = await signUp();
    for (const identifier of [user.username, user.email]) {
      await request(server())
        .post('/api/auth/login')
        .send({ identifier, password: user.password })
        .expect(200);
    }
  });
});

describe('rotación del token de refresco', () => {
  it('dos refrescos a la vez no cierran la sesión', async () => {
    const user = await signUp();

    // Dos pestañas que refrescan con la misma cookie: la carrera que antes
    // se confundía con un robo de token y cerraba todas las sesiones.
    const [first, second] = await Promise.all([
      request(server()).post('/api/auth/refresh').set('Cookie', user.refreshCookie),
      request(server()).post('/api/auth/refresh').set('Cookie', user.refreshCookie),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);

    const latest = refreshCookieOf(second.status === 200 ? second : first);
    await request(server()).post('/api/auth/refresh').set('Cookie', latest).expect(200);
  });

  it('reutilizar un token viejo revoca todas las sesiones', async () => {
    const user = await signUp();
    const rotated = await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', user.refreshCookie)
      .expect(200);
    expect(refreshCookieOf(rotated)).not.toEqual(user.refreshCookie);

    // Se envejece la revocación para salir de la ventana de gracia: a partir
    // de ahí, repetir el token viejo solo puede ser un token robado.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 120_000) },
    });

    await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', user.refreshCookie)
      .expect(401);

    const alive = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(alive).toBe(0);
  });
});

describe('sesión', () => {
  it('sin token no se llega a la API', async () => {
    await request(server()).get('/api/users/me').expect(401);
  });

  it('con token se responde el propio perfil', async () => {
    const user = await signUp();
    const response = await request(server()).get('/api/users/me').set(asUser(user)).expect(200);
    expect(response.body.user?.username ?? response.body.username).toBe(user.username);
  });
});
