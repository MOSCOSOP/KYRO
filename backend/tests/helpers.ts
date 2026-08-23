import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';

let app: Express | null = null;

export function server() {
  app ??= createApp();
  return app;
}

let counter = 0;

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  accessToken: string;
  refreshCookie: string;
}

/** Crea una cuenta nueva y devuelve lo necesario para hablar como ella. */
export async function signUp(overrides: Partial<{ username: string; password: string }> = {}) {
  counter += 1;
  const username = overrides.username ?? `prueba${counter}${Date.now().toString(36)}`;
  const password = overrides.password ?? 'contrasena-de-prueba';
  const email = `${username}@ejemplo.test`;

  const response = await request(server())
    .post('/api/auth/register')
    .send({ email, username, password, displayName: `Prueba ${counter}` })
    .expect(201);

  return {
    id: response.body.user.id,
    username,
    email,
    password,
    accessToken: response.body.accessToken,
    refreshCookie: refreshCookieOf(response),
  } satisfies TestUser;
}

/** La cookie de refresco tal cual, para reenviarla en la siguiente petición. */
export function refreshCookieOf(response: request.Response) {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = (raw ?? []).find((value) => value.startsWith('kyro_rt='));
  return cookie ? cookie.split(';')[0] : '';
}

export function asUser(user: TestUser) {
  return { Authorization: `Bearer ${user.accessToken}` };
}
