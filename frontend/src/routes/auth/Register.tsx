import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { LIMITS } from '@kyro/shared';
import { brand, pageTitle } from '@/config/brand';
import { useSession } from '@/store/session';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import styles from './Auth.module.css';

export function Register() {
  const register = useSession((state) => state.register);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = pageTitle('Crear cuenta');
  }, []);

  const usernameError = useMemo(() => {
    if (!username) return null;
    if (username.length < LIMITS.username.min) return 'Mínimo 3 caracteres';
    if (!LIMITS.username.pattern.test(username)) {
      return 'Solo minúsculas, números, punto y guion bajo';
    }
    return null;
  }, [username]);

  const passwordError =
    password && password.length < LIMITS.password.min
      ? `Mínimo ${LIMITS.password.min} caracteres`
      : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (usernameError || passwordError) return;
    setError(null);
    setLoading(true);
    try {
      await register({
        email: email.trim(),
        username: username.trim().toLowerCase(),
        password,
        displayName: displayName.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta');
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.brand}>
          <span className={styles.wordmark}>{brand.name}</span>
          <span className={styles.tagline}>{brand.idea}</span>
        </header>

        <div className={styles.panel}>
          <div>
            <h1 className={styles.title}>Crea tu cuenta</h1>
            <p className={styles.subtitle}>Un minuto y estás dentro.</p>
          </div>

          {error ? (
            <div className={styles.alert} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <form className={styles.form} onSubmit={submit}>
            <Field label="Tu nombre">
              {(id) => (
                <Input
                  id={id}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                  maxLength={LIMITS.displayName.max}
                  autoFocus
                />
              )}
            </Field>

            <Field label="Nombre de usuario" error={usernameError} hint="Así te encontrarán: @tunombre">
              {(id) => (
                <Input
                  id={id}
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  placeholder="alex"
                  autoComplete="username"
                  maxLength={LIMITS.username.max}
                  invalid={Boolean(usernameError)}
                  required
                />
              )}
            </Field>

            <Field label="Correo">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="alex@correo.com"
                  autoComplete="email"
                  required
                />
              )}
            </Field>

            <Field label="Contraseña" error={passwordError} hint="Al menos 8 caracteres">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  invalid={Boolean(passwordError)}
                  required
                />
              )}
            </Field>

            <Button type="submit" variant="primary" size="lg" block loading={loading}>
              Crear cuenta
            </Button>
          </form>
        </div>

        <p className={styles.footer}>
          ¿Ya tienes cuenta? <Link to="/entrar">Entrar</Link>
        </p>
        <p className={styles.legal}>
          {brand.name} {brand.titleSeparator} {brand.taglineEn}
        </p>
      </div>
    </main>
  );
}
