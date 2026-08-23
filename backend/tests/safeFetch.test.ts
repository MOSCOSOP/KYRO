import { describe, expect, it } from 'vitest';
import { assertPublicUrl } from '../src/lib/safeFetch.js';

/**
 * Estas comprobaciones son la única barrera entre «pegar un enlace» y «leer la
 * red interna del servidor». Si alguna deja de pasar, la vista previa de
 * enlaces se queda sin puerta.
 */
describe('destinos que no se pueden pedir', () => {
  const blocked = [
    ['metadatos de la nube', 'http://169.254.169.254/latest/meta-data/'],
    ['bucle local', 'http://127.0.0.1:4000/health'],
    ['bucle local por nombre', 'http://localhost:4000/health'],
    ['red privada 10.x', 'http://10.0.0.5/'],
    ['red privada 192.168.x', 'http://192.168.1.1/'],
    ['red privada 172.16.x', 'http://172.16.0.1/'],
    ['bucle local IPv6', 'http://[::1]/'],
    ['IPv4 empotrada en IPv6', 'http://[::ffff:127.0.0.1]/'],
    ['otro protocolo', 'file:///etc/passwd'],
    ['sin protocolo', 'esto-no-es-una-url'],
  ] as const;

  for (const [name, url] of blocked) {
    it(`rechaza ${name}`, async () => {
      await expect(assertPublicUrl(url)).rejects.toThrow();
    });
  }
});
