import { Fragment, useEffect, useRef, useState } from 'react';
import { Camera, LogOut, Monitor } from 'lucide-react';
import { LIMITS } from '@kyro/shared';
import { api, uploadFile } from '@/lib/api';
import { brand, pageTitle } from '@/config/brand';
import { fullStamp } from '@/lib/format';
import { useSession } from '@/store/session';
import { toastError, toastOk, useUI } from '@/store/ui';
import { Workspace } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Switch, Textarea } from '@/components/ui/Field';
import styles from './Settings.module.css';

interface SessionInfo {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current?: boolean;
}

export function SettingsPage() {
  useEffect(() => {
    document.title = pageTitle('Ajustes');
  }, []);

  return (
    <Workspace>
      <div className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Ajustes</h1>
          <ProfileSection />
          <NotificationsSection />
          <SecuritySection />
          <ShortcutsSection />
          <AboutSection />
        </div>
      </div>
    </Workspace>
  );
}

function ProfileSection() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!user) return null;

  const dirty =
    displayName !== user.displayName || username !== user.username || (bio ?? '') !== (user.bio ?? '');

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
      });
      toastOk('Perfil actualizado');
    } catch (err) {
      toastError(err, 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { attachment } = await uploadFile(file, { scope: 'avatar' });
      await updateProfile({ avatarUrl: attachment.url });
      toastOk('Foto actualizada');
    } catch (err) {
      toastError(err, 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Tu perfil</h2>

      <div className={styles.avatarRow}>
        <Avatar user={user} size="xl" presence />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<Camera size={16} />} loading={uploading} onClick={() => fileRef.current?.click()}>
            Cambiar foto
          </Button>
          {user.avatarUrl ? (
            <Button variant="ghost" onClick={() => void updateProfile({ avatarUrl: null })}>
              Quitar
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => void changeAvatar(event.target.files?.[0])}
          />
        </div>
      </div>

      <Field label="Nombre">
        {(id) => (
          <Input
            id={id}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={LIMITS.displayName.max}
          />
        )}
      </Field>

      <Field label="Nombre de usuario" hint="Así te encuentran los demás.">
        {(id) => (
          <Input
            id={id}
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            maxLength={LIMITS.username.max}
          />
        )}
      </Field>

      <Field label="Sobre ti">
        {(id) => (
          <Textarea
            id={id}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={LIMITS.bio.max}
            placeholder="Una línea sobre ti."
          />
        )}
      </Field>

      <div className={styles.actions}>
        <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
          Guardar cambios
        </Button>
      </div>
    </section>
  );
}

function NotificationsSection() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  if (!user) return null;

  const notifications = user.preferences.notifications;

  const toggle = (key: keyof typeof notifications, value: boolean) => {
    void updateProfile({
      preferences: { notifications: { ...notifications, [key]: value } },
    }).catch((err) => toastError(err, 'No se pudo guardar la preferencia'));
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Notificaciones</h2>
      <p className={styles.sectionHint}>Decide qué merece interrumpirte.</p>

      <Switch
        checked={notifications.messages}
        onChange={(value) => toggle('messages', value)}
        title="Mensajes directos"
      />
      <Switch
        checked={notifications.mentions}
        onChange={(value) => toggle('mentions', value)}
        title="Menciones"
        hint="Cuando alguien escribe @tu nombre."
      />
      <Switch
        checked={notifications.communities}
        onChange={(value) => toggle('communities', value)}
        title="Comunidades"
        hint="Anuncios, invitaciones y encuentros."
      />
      <Switch
        checked={notifications.calls}
        onChange={(value) => toggle('calls', value)}
        title="Llamadas"
      />

      <Switch
        checked={user.preferences.enterToSend}
        onChange={(value) =>
          void updateProfile({ preferences: { enterToSend: value } }).catch((err) => toastError(err))
        }
        title="Enviar con Enter"
        hint="Si lo desactivas, Enter salta de línea y Ctrl+Enter envía."
      />
    </section>
  );
}

function SecuritySection() {
  const logout = useSession((state) => state.logout);
  const confirm = useUI((state) => state.confirm);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);

  useEffect(() => {
    api
      .get<{ items: SessionInfo[] }>('/auth/sessions')
      .then((data) => setSessions(data.items))
      .catch(() => setSessions([]));
  }, []);

  const changePassword = async () => {
    if (next.length < LIMITS.password.min) return;
    setSaving(true);
    try {
      await api.post('/auth/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      toastOk('Contraseña actualizada');
    } catch (err) {
      toastError(err, 'No se pudo cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  const closeAll = async () => {
    const ok = await confirm({
      title: '¿Cerrar todas las sesiones?',
      description: 'Se cerrará también esta. Tendrás que volver a entrar.',
      confirmLabel: 'Cerrar todas',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post('/auth/logout-all');
      await logout();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Seguridad</h2>

      <Field label="Contraseña actual">
        {(id) => (
          <Input
            id={id}
            type="password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            autoComplete="current-password"
          />
        )}
      </Field>

      <Field label="Nueva contraseña" hint={`Al menos ${LIMITS.password.min} caracteres.`}>
        {(id) => (
          <Input
            id={id}
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
          />
        )}
      </Field>

      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={changePassword}
          loading={saving}
          disabled={!current || next.length < LIMITS.password.min}
        >
          Cambiar contraseña
        </Button>
      </div>

      <h3 className={styles.sectionTitle}>Sesiones abiertas</h3>
      {sessions?.map((session) => (
        <div key={session.id} className={styles.sessionRow}>
          <Monitor size={16} />
          <span className={styles.sessionText}>
            <span className={styles.sessionTitle}>{session.userAgent ?? 'Dispositivo'}</span>
            <span className={styles.sessionMeta}>Desde {fullStamp(session.createdAt)}</span>
          </span>
          <IconButton
            label="Cerrar esta sesión"
            onClick={async () => {
              try {
                await api.delete(`/auth/sessions/${session.id}`);
                setSessions((current) => current?.filter((item) => item.id !== session.id) ?? null);
              } catch (err) {
                toastError(err);
              }
            }}
          >
            <LogOut size={15} />
          </IconButton>
        </div>
      ))}

      <div className={styles.actions}>
        <Button variant="danger" onClick={closeAll}>
          Cerrar todas las sesiones
        </Button>
      </div>
    </section>
  );
}

function ShortcutsSection() {
  const modifier = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
  const shortcuts: [string, string][] = [
    ['Buscar en todo KYRO', `${modifier} + K`],
    ['Ir a Inicio', `${modifier} + Shift + H`],
    ['Ir a Mensajes', `${modifier} + Shift + M`],
    ['Ir a Comunidades', `${modifier} + Shift + C`],
    ['Ir a Actividad', `${modifier} + Shift + A`],
    ['Ir a Llamadas', `${modifier} + Shift + L`],
  ];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Atajos de teclado</h2>
      <div className={styles.shortcuts}>
        {shortcuts.map(([label, keys]) => (
          <Fragment key={label}>
            <span>{label}</span>
            <span className={styles.key}>{keys}</span>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className={styles.section}>
      <div className={styles.about}>
        <span className={styles.brandName}>{brand.name}</span>
        <span>{brand.tagline}</span>
        <span>{brand.idea}</span>
      </div>
    </section>
  );
}
