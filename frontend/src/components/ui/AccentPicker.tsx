import clsx from 'clsx';
import { Check } from 'lucide-react';
import styles from './AccentPicker.module.css';

/**
 * Una paleta corta, no un selector de color libre.
 *
 * Con un input de color cualquiera podría elegir un amarillo ilegible sobre el
 * fondo oscuro; con seis tonos medidos, cualquier elección sigue siendo KYRO.
 */
export const ACCENTS: { value: string; name: string }[] = [
  { value: '#4c7dff', name: 'Azul' },
  { value: '#a46bff', name: 'Violeta' },
  { value: '#35c3c8', name: 'Turquesa' },
  { value: '#3fc98c', name: 'Verde' },
  { value: '#e0b155', name: 'Ámbar' },
  { value: '#f07a72', name: 'Coral' },
];

export function AccentPicker({
  value,
  onChange,
  disabled,
  label = 'Color',
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className={styles.row} role="radiogroup" aria-label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label="Color de KYRO"
        disabled={disabled}
        className={clsx(styles.swatch, styles.brand, value === null && styles.selected)}
        onClick={() => onChange(null)}
      >
        {value === null ? <Check size={13} strokeWidth={3} /> : null}
      </button>

      {ACCENTS.map((accent) => (
        <button
          key={accent.value}
          type="button"
          role="radio"
          aria-checked={value === accent.value}
          aria-label={accent.name}
          disabled={disabled}
          className={clsx(styles.swatch, value === accent.value && styles.selected)}
          style={{ background: accent.value }}
          onClick={() => onChange(accent.value)}
        >
          {value === accent.value ? <Check size={13} strokeWidth={3} /> : null}
        </button>
      ))}
    </div>
  );
}
