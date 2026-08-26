import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, AtSign } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { LIMITS } from '@kyro/shared';
import { ApiError, api } from '@/lib/api';
import { pageTitle } from '@/config/brand';
import { dur } from '@/lib/motion';
import { useSession } from '@/store/session';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AuthField, PasswordField, PasswordStrength } from './AuthField';
import { AuthLayout } from './AuthLayout';
import styles from './Auth.module.css';

type UsernameState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'bad'; message: string };

const STEP_LABELS = ['Cuenta', 'Identidad', 'Listo'];

const USERNAME_REASON: Record<string, string> = {
  short: `Mínimo ${LIMITS.username.min} caracteres.`,
  long: `Máximo ${LIMITS.username.max} caracteres.`,
  invalid: 'Solo minúsculas, números, punto y guion bajo.',
  taken: 'Ese @usuario ya está en uso.',
};

function explain(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'network_error') return 'No hemos podido conectar con KYRO.';
    if (err.status === 429) return 'Demasiados intentos. Espera unos minutos.';
    return err.message;
  }
  return 'No hemos podido crear la cuenta.';
}

export function Register() {
  const register = useSession((state) => state.register);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameState, setUsernameState] = useState<UsernameState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const stepPanelRef = useRef<HTMLDivElement>(null);
  const prevStep = useRef(0);

  useEffect(() => {
    document.title = pageTitle('Crear cuenta');
  }, []);

  // El paso entra desde el lado del que viene: a la derecha al avanzar, a la
  // izquierda al retroceder. Es lo que CSS no puede saber sin duplicar estado.
  useGSAP(
    () => {
      const panel = stepPanelRef.current;
      if (!panel) return;
      const direction = step >= prevStep.current ? 1 : -1;
      prevStep.current = step;
      gsap.fromTo(
        panel,
        { opacity: 0, x: 12 * direction },
        { opacity: 1, x: 0, duration: dur('normal') },
      );
    },
    { dependencies: [step], scope: stepPanelRef },
  );

  /* Disponibilidad del @usuario mientras se escribe. */
  useEffect(() => {
    const value = username.trim().toLowerCase();
    if (!value) {
      setUsernameState({ status: 'idle' });
      return;
    }
    if (value.length < LIMITS.username.min) {
      setUsernameState({ status: 'bad', message: USERNAME_REASON.short });
      return;
    }
    if (!LIMITS.username.pattern.test(value)) {
      setUsernameState({ status: 'bad', message: USERNAME_REASON.invalid });
      return;
    }

    let cancelled = false;
    setUsernameState({ status: 'checking' });
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.get<{ available: boolean; reason?: string }>('/auth/username', {
          query: { u: value },
          skipRefresh: true,
        });
        if (cancelled) return;
        setUsernameState(
          result.available
            ? { status: 'ok' }
            : {
                status: 'bad',
                message: USERNAME_REASON[result.reason ?? 'taken'] ?? USERNAME_REASON.taken,
              },
        );
      } catch {
        // Sin respuesta no se afirma nada: el servidor decidirá al crear la cuenta.
        if (!cancelled) setUsernameState({ status: 'idle' });
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username]);

  const emailError = useMemo(() => {
    if (!email) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Ese correo no parece válido.';
  }, [email]);

  const passwordError =
    password && password.length < LIMITS.password.min
      ? `La contraseña necesita al menos ${LIMITS.password.min} caracteres.`
      : null;

  const confirmError = confirm && confirm !== password ? 'Las contraseñas no coinciden.' : null;

  const canContinueAccount =
    Boolean(email) && !emailError && password.length >= LIMITS.password.min && confirm === password;

  const canContinueIdentity = displayName.trim().length > 0 && usernameState.status === 'ok';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await register({
        email: email.trim(),
        username: username.trim().toLowerCase(),
        password,
        displayName: displayName.trim(),
      });
    } catch (err) {
      setError(explain(err));
      setLoading(false);
      // Si el conflicto es de identidad, se vuelve al paso que lo resuelve.
      if (err instanceof ApiError && err.status === 409) setStep(1);
    }
  };

  return (
    <AuthLayout
      statement={['Crea tu', 'identidad en KYRO.']}
      support="Un nombre, un @usuario y ya estás dentro. Podrás cambiarlo cuando quieras."
    >
      <header className={styles.head}>
        <h2 className={styles.title}>Crear una cuenta</h2>
        <p className={styles.subtitle}>{STEP_LABELS[step]} · Paso {step + 1} de 3</p>
      </header>

      <div className={styles.steps} aria-hidden>
        {STEP_LABELS.map((label, index) => (
          <span
            key={label}
            className={`${styles.step} ${
              index < step ? styles.stepDone : index === step ? styles.stepCurrent : ''
            }`}
          >
            <span className={styles.stepFill} />
          </span>
        ))}
      </div>

      {error ? (
        <div className={styles.alert} role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={submit} noValidate>
        {step === 0 ? (
          <div className={styles.stepPanel} key="cuenta" ref={stepPanelRef}>
            <AuthField
              label="Correo"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={emailError}
              autoComplete="email"
              autoFocus
              required
            />

            <div>
              <PasswordField
                label="Contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={passwordError}
                autoComplete="new-password"
                required
              />
              <PasswordStrength value={password} />
            </div>

            <PasswordField
              label="Repite la contraseña"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              error={confirmError}
              autoComplete="new-password"
              required
            />

            <Button
              variant="primary"
              size="lg"
              block
              disabled={!canContinueAccount}
              icon={<ArrowRight size={16} />}
              onClick={() => setStep(1)}
            >
              Continuar
            </Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className={styles.stepPanel} key="identidad" ref={stepPanelRef}>
            <AuthField
              label="Tu nombre"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={LIMITS.displayName.max}
              autoComplete="name"
              autoFocus
              required
            />

            <AuthField
              label="@usuario"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))
              }
              maxLength={LIMITS.username.max}
              autoComplete="off"
              spellCheck={false}
              status={usernameState.status}
              error={usernameState.status === 'bad' ? usernameState.message : null}
              success={usernameState.status === 'ok' ? `@${username} está disponible.` : null}
              hint="Así te encontrarán en KYRO."
              required
            />

            <div className={styles.actions}>
              <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(0)}>
                Atrás
              </Button>
              <Button
                variant="primary"
                disabled={!canContinueIdentity}
                icon={<ArrowRight size={16} />}
                onClick={() => setStep(2)}
              >
                Continuar
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className={styles.stepPanel} key="listo" ref={stepPanelRef}>
            <div className={styles.ready}>
              <Avatar name={displayName} size="xl" />
              <div>
                <div className={styles.readyName}>{displayName}</div>
                <div className={styles.readyHandle}>
                  <AtSign size={12} style={{ display: 'inline', verticalAlign: '-1px' }} />
                  {username}
                </div>
              </div>
              <p className={styles.subtitle}>
                Esto es lo que verán los demás. Podrás cambiarlo en cualquier momento.
              </p>
            </div>

            <div className={styles.actions}>
              <Button
                variant="ghost"
                icon={<ArrowLeft size={16} />}
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Atrás
              </Button>
              <Button type="submit" variant="primary" loading={loading}>
                Crear cuenta
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      <p className={styles.footer}>
        ¿Ya tienes cuenta?
        <Link className={styles.link} to="/entrar">
          Acceder
        </Link>
      </p>
    </AuthLayout>
  );
}
