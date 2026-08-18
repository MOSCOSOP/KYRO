/**
 * Identidad de KYRO en un solo sitio.
 *
 * Todo lo visible que nombra al producto sale de aquí: títulos, pantallas de
 * acceso, navegación y metadatos. Cambiar la marca es cambiar este archivo
 * (y el favicon en index.html).
 */
export const brand = {
  name: 'KYRO',
  tagline: 'Conecta. Habla. Pertenece.',
  taglineEn: 'Connect. Talk. Belong.',
  idea: 'Un espacio donde las conversaciones, comunidades y encuentros viven juntos.',
  /** Se usa en el <title> de cada pantalla: "Mensajes · KYRO". */
  titleSeparator: '·',
  supportUrl: null as string | null,
} as const;

export function pageTitle(section?: string) {
  return section ? `${section} ${brand.titleSeparator} ${brand.name}` : brand.name;
}
