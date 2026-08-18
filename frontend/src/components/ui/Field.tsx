import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import styles from './Field.module.css';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children(id)}
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, icon, className, ...rest },
  ref,
) {
  const control = (
    <input
      ref={ref}
      className={clsx(styles.control, invalid && styles.invalid, className)}
      {...rest}
    />
  );

  if (!icon) return control;
  return (
    <span className={styles.withIcon}>
      <span className={styles.iconSlot}>{icon}</span>
      {control}
    </span>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={clsx(styles.control, styles.textarea, invalid && styles.invalid, className)}
      {...rest}
    />
  );
});

export function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span className={styles.counter}>
      {value}/{max}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchText}>
        <span className={styles.switchTitle}>{title}</span>
        {hint ? <span className={styles.switchHint}>{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        className={clsx(styles.switch, checked && styles.switchOn)}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}
