/**
 * El símbolo de KYRO en vectorial.
 *
 * Misma geometría que el logotipo —anillo partido en cuatro arcos y una K
 * angular—, pero dibujado para la interfaz: el original es negro sobre negro y
 * a 24 px desaparecería. Aquí el anillo lleva el filo de luz azul→violeta y la
 * K va en claro, de modo que se lee igual en un botón que en una pantalla de
 * acceso.
 */
export function KyroMark({ size = 32, className }: { size?: number; className?: string }) {
  // Identificadores únicos: puede haber varias marcas en la misma página.
  const id = `kyro-mark-${size}`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-ring`} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand-blue, #4c7dff)" />
          <stop offset="1" stopColor="var(--brand-violet, #a46bff)" />
        </linearGradient>
        <linearGradient id={`${id}-k`} x1="24" y1="16" x2="40" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4f6fa" />
          <stop offset="1" stopColor="#9fabc4" />
        </linearGradient>
      </defs>

      {/* Anillo: cuatro arcos con aberturas, como en el logotipo. */}
      <circle
        cx="32"
        cy="32"
        r="27"
        stroke={`url(#${id}-ring)`}
        strokeWidth="2.5"
        strokeDasharray="34 8.4"
        strokeDashoffset="17"
        strokeLinecap="butt"
      />

      {/* K angular: asta y dos brazos en corte recto. */}
      <path
        d="M21 17h6.4v30H21V17Z M27.4 30.6 38.2 18.4h8.4L32.1 34.6l-4.7-4Z M31.9 30.2 46.9 47h-8.6L27.4 34.3l4.5-4.1Z"
        fill={`url(#${id}-k)`}
      />
    </svg>
  );
}
