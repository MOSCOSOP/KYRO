import clsx from 'clsx';
import styles from './Segmented.module.css';

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

/** Elección entre pocas opciones excluyentes. Todas visibles, sin desplegar. */
export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={clsx(styles.option, value === option.value && styles.selected)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Fila de ajuste: a la izquierda qué es, a la derecha el control. */
export function SettingRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
      {/*
        Todos los controles comparten ancho, así que sus bordes izquierdos caen
        en la misma línea aunque las etiquetas midan distinto. Es la diferencia
        entre una lista de ajustes y una columna desalineada.
      */}
      <span className={styles.control}>{children}</span>
    </div>
  );
}
