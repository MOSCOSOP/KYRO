import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { asUser, server, signUp, type TestUser } from './helpers.js';

let ana: TestUser;
let beto: TestUser;
let curiosa: TestUser;
let conversationId: string;

beforeAll(async () => {
  [ana, beto, curiosa] = await Promise.all([signUp(), signUp(), signUp()]);
  const response = await request(server())
    .post('/api/conversations/direct')
    .set(asUser(ana))
    .send({ userId: beto.id })
    .expect(201);
  conversationId = response.body.id ?? response.body.conversation?.id;
});

describe('mensajes en un privado', () => {
  it('se envía y aparece en el hilo de los dos', async () => {
    const sent = await request(server())
      .post(`/api/conversations/${conversationId}/messages`)
      .set(asUser(ana))
      .send({ content: 'hola' })
      .expect(201);

    expect(sent.body.content).toBe('hola');

    const asBeto = await request(server())
      .get(`/api/conversations/${conversationId}/messages`)
      .set(asUser(beto))
      .expect(200);

    expect(asBeto.body.items.map((item: { content: string }) => item.content)).toContain('hola');
  });

  it('quien no participa no lo lee', async () => {
    const response = await request(server())
      .get(`/api/conversations/${conversationId}/messages`)
      .set(asUser(curiosa));
    expect([403, 404]).toContain(response.status);
  });

  it('solo el autor edita el suyo', async () => {
    const sent = await request(server())
      .post(`/api/conversations/${conversationId}/messages`)
      .set(asUser(ana))
      .send({ content: 'texto original' })
      .expect(201);

    await request(server())
      .patch(`/api/messages/${sent.body.id}`)
      .set(asUser(beto))
      .send({ content: 'editado por otro' })
      .expect((response) => {
        expect([403, 404]).toContain(response.status);
      });

    const edited = await request(server())
      .patch(`/api/messages/${sent.body.id}`)
      .set(asUser(ana))
      .send({ content: 'texto corregido' })
      .expect(200);

    expect(edited.body.content).toBe('texto corregido');
    expect(edited.body.editedAt).toBeTruthy();
  });

  it('al borrarlo queda el hueco, no el contenido', async () => {
    const sent = await request(server())
      .post(`/api/conversations/${conversationId}/messages`)
      .set(asUser(ana))
      .send({ content: 'esto se va' })
      .expect(201);

    await request(server()).delete(`/api/messages/${sent.body.id}`).set(asUser(ana)).expect(200);

    const thread = await request(server())
      .get(`/api/conversations/${conversationId}/messages`)
      .set(asUser(beto))
      .expect(200);

    const found = thread.body.items.find((item: { id: string }) => item.id === sent.body.id);
    expect(found?.deletedAt).toBeTruthy();
    expect(found?.content).toBe('');
  });
});

describe('privacidad', () => {
  it('con «solo contactos» no entra un mensaje de un desconocido', async () => {
    await request(server())
      .patch('/api/users/me')
      .set(asUser(beto))
      .send({ preferences: { privacy: { messages: 'contacts' } } })
      .expect(200);

    const response = await request(server())
      .post('/api/conversations/direct')
      .set(asUser(curiosa))
      .send({ userId: beto.id });

    // O bien no deja abrir la conversación, o bien no deja escribir en ella.
    if (response.status === 201) {
      const blocked = await request(server())
        .post(`/api/conversations/${response.body.id}/messages`)
        .set(asUser(curiosa))
        .send({ content: 'hola desconocido' });
      expect(blocked.status).toBe(403);
    } else {
      expect(response.status).toBe(403);
    }

    await request(server())
      .patch('/api/users/me')
      .set(asUser(beto))
      .send({ preferences: { privacy: { messages: 'everyone' } } })
      .expect(200);
  });
});
