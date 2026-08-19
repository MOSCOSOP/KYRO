import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { pageTitle } from '@/config/brand';
import { useSession } from '@/store/session';
import { Button } from '@/components/ui/Button';
import { AuthField, PasswordField } from './AuthField';
import { AuthLayout } from './AuthLayout';
import styles from './Auth.module.css';

/** Traduce el fallo a algo que el usuario pueda resolver. */
function explain(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'network_error') {
      return 'No hemos podido conectar con KYRO. Revisa tu conexión.';
    }
    if (err.status === 401) return 'Las credenciales no coinciden.';
    if (err.status === 429) return 'Demasiados intentos. Espera unos minutos.';
    return err.message;
  }
  return 'No hemos podido iniciar sesión.';
}

export function Login() {
  const login = useSession((state) => state.login);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = pageTitle('Acceder');
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(explain(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      statement={['Tu espacio', 'de comunicación.']}
      support="Conversaciones, comunidades y encuentros en un mismo lugar. Sin cambiar de aplicación para hablar, llamar o compartir."
    >
      <header className={styles.head}>
        <h2 className={styles.title}>Accede a tu cuenta</h2>
        <p className={styles.subtitle}>Continúa donde lo dejaste.</p>
      </header>

      {error ? (
        <div className={styles.alert} role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={submit} noValidate>
        <AuthField
          label="Correo o @usuario"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          autoFocus
          required
        />

        <PasswordField
          label="Contraseña"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={loading}
          disabled={!identifier.trim() || !password}
          icon={loading ? undefined : <ArrowRight size={16} />}
        >
          Entrar
        </Button>
      </form>

      <p className={styles.footer}>
        ¿No tienes cuenta?
        <Link className={styles.link} to="/crear-cuenta">
          Crear una cuenta
        </Link>
      </p>
    </AuthLayout>
  );
}
