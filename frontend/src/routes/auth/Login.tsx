import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { brand, pageTitle } from '@/config/brand';
import { useSession } from '@/store/session';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import styles from './Auth.module.css';

export function Login() {
  const login = useSession((state) => state.login);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = pageTitle('Entrar');
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.brand}>
          <span className={styles.wordmark}>{brand.name}</span>
          <span className={styles.tagline}>{brand.tagline}</span>
        </header>

        <div className={styles.panel}>
          <div>
            <h1 className={styles.title}>Bienvenido de nuevo</h1>
            <p className={styles.subtitle}>Entra para seguir la conversación.</p>
          </div>

          {error ? (
            <div className={styles.alert} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <form className={styles.form} onSubmit={submit}>
            <Field label="Correo o usuario">
              {(id) => (
                <Input
                  id={id}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="alex o alex@correo.com"
                />
              )}
            </Field>

            <Field label="Contraseña">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
              )}
            </Field>

            <Button type="submit" variant="primary" size="lg" block loading={loading}>
              Entrar
            </Button>
          </form>
        </div>

        <p className={styles.footer}>
          ¿Aún no tienes cuenta? <Link to="/crear-cuenta">Crear cuenta</Link>
        </p>
      </div>
    </main>
  );
}
