import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import styles from './AuthField.module.css';

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder'> {
  label: string;
  /** Se muestra bajo el campo cuando no hay error. */
  hint?: string;
  error?: string | null;
  /** Mensaje afirmativo (por ejemplo, un @usuario libre). */
  success?: string | null;
  /** Indicador a la derecha del campo. */
  status?: 'idle' | 'checking' | 'ok' | 'bad';
  addon?: ReactNode;
}

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, hint, error, success, status = 'idle', addon, className, ...rest },
  ref,
) {
  const id = useId();
  const hasAddon = Boolean(addon) || status !== 'idle';

  return (
    <div className={clsx(styles.wrapper, className)}>
      <div className={clsx(styles.field, error && styles.invalid, hasAddon && styles.withAddon)}>
        <input
          ref={ref}
          id={id}
          className={styles.input}
          placeholder=" "
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint || success ? `${id}-note` : undefined}
          {...rest}
        />
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>

        {addon ??
          (status === 'idle' ? null : (
            <span
              className={clsx(
                styles.addon,
                status === 'ok' && styles.statusOk,
                status === 'bad' && styles.statusBad,
              )}
              aria-hidden
            >
              {status === 'checking' ? (
                <Loader2 size={15} className={styles.spin} />
              ) : status === 'ok' ? (
                <Check size={15} />
              ) : (
                <AlertCircle size={15} />
              )}
            </span>
          ))}
      </div>

      {error || success || hint ? (
        <p
          id={`${id}-note`}
          className={clsx(styles.note, error && styles.noteError, !error && success && styles.noteOk)}
          role={error ? 'alert' : undefined}
        >
          {error ?? success ?? hint}
        </p>
      ) : null}
    </div>
  );
});

/** Campo de contraseña con revelado. Nada más: los requisitos van aparte. */
export const PasswordField = forwardRef<HTMLInputElement, Omit<AuthFieldProps, 'addon' | 'type'>>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <AuthField
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        addon={
          <button
            type="button"
            className={styles.addon}
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            tabIndex={-1}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />
    );
  },
);

/**
 * Fuerza de la contraseña en tres tramos. Aparece solo cuando el usuario ya ha
 * escrito algo: nadie necesita una lista de reglas antes de empezar.
 */
export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;

  const score = strengthOf(value);
  const level = score < 2 ? 'weak' : score < 4 ? 'medium' : 'strong';

  return (
    <div className={styles.strength} aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={clsx(
            styles.bar,
            level === 'weak' && index === 0 && styles.barWeak,
            level === 'medium' && index <= 1 && styles.barMedium,
            level === 'strong' && styles.barStrong,
          )}
        />
      ))}
    </div>
  );
}

function strengthOf(value: string) {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^\w\s]/.test(value)) score++;
  return score;
}
