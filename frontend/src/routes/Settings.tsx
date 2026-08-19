import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  ArrowLeft,
  Bell,
  Camera,
  Headphones,
  LogOut,
  Monitor,
  Palette,
  Shield,
  User,
} from 'lucide-react';
import { LIMITS, type Audience } from '@kyro/shared';
import { api, uploadFile } from '@/lib/api';
import { requestSystemPermission, systemPermission } from '@/lib/alerts';
import { brand, pageTitle } from '@/config/brand';
import {
  listDevices,
  getPreferredDevices,
  setPreferredDevice,
  type DeviceOption,
} from '@/lib/devices';
import { fullStamp } from '@/lib/format';
import { useSession } from '@/store/session';
import { toastError, toastOk, useUI } from '@/store/ui';
import { Workspace } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Switch, Textarea } from '@/components/ui/Field';
import { Segmented, SettingRow } from '@/components/ui/Segmented';
import { useIsCompact } from '@/hooks/useMediaQuery';
import styles from './Settings.module.css';

type Section = 'cuenta' | 'privacidad' | 'notificaciones' | 'apariencia' | 'medios' | 'seguridad';

const SECTIONS: { id: Section; label: string; icon: ReactNode; hint: string }[] = [
  { id: 'cuenta', label: 'Cuenta', icon: <User size={15} />, hint: 'Tu nombre, tu @usuario y tu foto.' },
  { id: 'privacidad', label: 'Privacidad', icon: <Shield size={15} />, hint: 'Quién puede llegar hasta ti.' },
  { id: 'notificaciones', label: 'Notificaciones', icon: <Bell size={15} />, hint: 'Qué merece interrumpirte.' },
  { id: 'apariencia', label: 'Apariencia', icon: <Palette size={15} />, hint: 'Cómo se comporta la interfaz.' },
  { id: 'medios', label: 'Audio y vídeo', icon: <Headphones size={15} />, hint: 'Micrófono y cámara de las llamadas.' },
  { id: 'seguridad', label: 'Seguridad', icon: <Shield size={15} />, hint: 'Contraseña y sesiones abiertas.' },
];

export function SettingsPage() {
  const [section, setSection] = useState<Section | null>(null);
  const compact = useIsCompact();

  useEffect(() => {
    document.title = pageTitle('Ajustes');
  }, []);

  // En pantallas anchas siempre hay una sección abierta.
  const current = section ?? (compact ? null : 'cuenta');

  return (
    <Workspace
      sidebar={
        <nav className={styles.nav} aria-label="Secciones de ajustes">
          <header className={styles.navHeader}>Ajustes</header>
          <div className={styles.navList}>
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={clsx(styles.navItem, current === item.id && styles.navItemActive)}
                onClick={() => setSection(item.id)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      }
      showContent={Boolean(current)}
    >
      {current ? (
        <div className={styles.page}>
          <div className={styles.inner} key={current}>
            {compact ? (
              <IconButton label="Volver a los ajustes" onClick={() => setSection(null)}>
                <ArrowLeft size={18} />
              </IconButton>
            ) : null}

            <h1 className={styles.title}>{SECTIONS.find((item) => item.id === current)?.label}</h1>
            <p className={styles.lead}>{SECTIONS.find((item) => item.id === current)?.hint}</p>

            {current === 'cuenta' ? <AccountSection /> : null}
            {current === 'privacidad' ? <PrivacySection /> : null}
            {current === 'notificaciones' ? <NotificationsSection /> : null}
            {current === 'apariencia' ? <AppearanceSection /> : null}
            {current === 'medios' ? <MediaSection /> : null}
            {current === 'seguridad' ? <SecuritySection /> : null}
          </div>
        </div>
      ) : null}
    </Workspace>
  );
}

/* --------------------------------- Cuenta ---------------------------------- */

function AccountSection() {
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
    displayName !== user.displayName ||
    username !== user.username ||
    (bio ?? '') !== (user.bio ?? '');

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
    <>
      <div className={styles.block}>
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
      </div>

      <div className={styles.block}>
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

        <Field label="@usuario" hint="Así te encuentran los demás.">
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
      </div>

      <p className={styles.sessionMeta}>{user.email}</p>
    </>
  );
}

/* -------------------------------- Privacidad -------------------------------- */

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'everyone', label: 'Todos' },
  { value: 'contacts', label: 'Solo contactos' },
];

function PrivacySection() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  if (!user) return null;

  const privacy = user.preferences.privacy;

  const change = (patch: Partial<typeof privacy>) => {
    void updateProfile({ preferences: { privacy: { ...privacy, ...patch } } }).catch((err) =>
      toastError(err, 'No se pudo guardar la preferencia'),
    );
  };

  return (
    <>
      <div className={styles.block}>
        <span className={styles.blockTitle}>Quién puede llegar hasta ti</span>

        <SettingRow
          title="Mensajes de personas nuevas"
          hint="Las conversaciones que ya existen no se ven afectadas."
        >
          <Segmented
            label="Quién puede escribirte"
            value={privacy.messages}
            options={AUDIENCE_OPTIONS}
            onChange={(value) => change({ messages: value })}
          />
        </SettingRow>

        <SettingRow title="Llamadas" hint="Quién puede llamarte directamente.">
          <Segmented
            label="Quién puede llamarte"
            value={privacy.calls}
            options={AUDIENCE_OPTIONS}
            onChange={(value) => change({ calls: value })}
          />
        </SettingRow>
      </div>

      <div className={styles.block}>
        <span className={styles.blockTitle}>Lo que los demás ven</span>

        <Switch
          checked={privacy.showPresence}
          onChange={(value) => change({ showPresence: value })}
          title="Mostrar mi presencia"
          hint="Si lo desactivas, aparecerás siempre como desconectado."
        />
        <Switch
          checked={privacy.showLastSeen}
          onChange={(value) => change({ showLastSeen: value })}
          title="Mostrar mi última conexión"
        />
      </div>

      <p className={styles.sessionMeta}>
        Estas reglas se aplican en el servidor: quien no pueda escribirte o llamarte no lo
        conseguirá aunque lo intente por su cuenta.
      </p>
    </>
  );
}

/* ------------------------------ Notificaciones ------------------------------ */

function NotificationsSection() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  if (!user) return null;

  const notifications = user.preferences.notifications;

  const toggle = (key: keyof typeof notifications, value: boolean) => {
    void updateProfile({ preferences: { notifications: { ...notifications, [key]: value } } }).catch(
      (err) => toastError(err, 'No se pudo guardar la preferencia'),
    );
  };

  return (
    <div className={styles.block}>
      <Switch
        checked={notifications.messages}
        onChange={(value) => toggle('messages', value)}
        title="Mensajes directos"
      />
      <Switch
        checked={notifications.mentions}
        onChange={(value) => toggle('mentions', value)}
        title="Menciones"
        hint="Cuando alguien escribe tu @usuario."
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
        checked={notifications.sounds}
        onChange={(value) => toggle('sounds', value)}
        title="Sonidos"
        hint="Un tono corto al recibir un mensaje y timbre en las llamadas."
      />

      <SystemNotifications
        enabled={notifications.system}
        onChange={(value) => toggle('system', value)}
      />

      <p className={styles.sessionMeta}>
        En «No molestar» KYRO no suena ni avisa, sea cual sea esta configuración.
      </p>
    </div>
  );
}

/**
 * Avisos del navegador. El interruptor no puede mentir: si el permiso está
 * denegado, lo dice y explica dónde se cambia, en vez de quedarse encendido
 * sin hacer nada.
 */
function SystemNotifications({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const [permission, setPermission] = useState(systemPermission());

  if (permission === 'unsupported') {
    return (
      <Switch
        checked={false}
        onChange={() => undefined}
        disabled
        title="Avisos del sistema"
        hint="Este navegador no los admite."
      />
    );
  }

  if (permission === 'denied') {
    return (
      <Switch
        checked={false}
        onChange={() => undefined}
        disabled
        title="Avisos del sistema"
        hint="Bloqueados en el navegador. Actívalos en los permisos del sitio."
      />
    );
  }

  return (
    <Switch
      checked={enabled && permission === 'granted'}
      title="Avisos del sistema"
      hint="Cuando KYRO no está en primer plano."
      onChange={async (value) => {
        if (!value) {
          onChange(false);
          return;
        }
        const result = await requestSystemPermission();
        setPermission(result);
        onChange(result === 'granted');
        if (result === 'denied') {
          toastError(new Error('El navegador ha bloqueado los avisos'));
        }
      }}
    />
  );
}

/* -------------------------------- Apariencia -------------------------------- */

function AppearanceSection() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  const modifier = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';

  if (!user) return null;

  const shortcuts: [string, string][] = [
    ['Buscar y ejecutar acciones', `${modifier} + K`],
    ['Ir a Inicio', `${modifier} + Shift + H`],
    ['Ir a Mensajes', `${modifier} + Shift + M`],
    ['Ir a Comunidades', `${modifier} + Shift + C`],
    ['Ir a Actividad', `${modifier} + Shift + A`],
    ['Ir a Llamadas', `${modifier} + Shift + L`],
    ['Enviar mensaje', user.preferences.enterToSend ? 'Enter' : `${modifier} + Enter`],
    ['Nueva línea', user.preferences.enterToSend ? 'Shift + Enter' : 'Enter'],
  ];

  return (
    <>
      <div className={styles.block}>
        <SettingRow
          title="Profundidad"
          hint="El mismo KYRO, con el fondo más hondo o algo más suave."
        >
          <Segmented
            label="Tema"
            value={user.preferences.theme}
            options={[
              { value: 'deep', label: 'Profundo' },
              { value: 'soft', label: 'Suave' },
            ]}
            onChange={(value) =>
              void updateProfile({ preferences: { theme: value } }).catch((err) => toastError(err))
            }
          />
        </SettingRow>
      </div>

      <div className={styles.block}>
        <Switch
          checked={user.preferences.enterToSend}
          onChange={(value) =>
            void updateProfile({ preferences: { enterToSend: value } }).catch((err) =>
              toastError(err),
            )
          }
          title="Enviar con Enter"
          hint="Si lo desactivas, Enter salta de línea y Ctrl+Enter envía."
        />
        <Switch
          checked={user.preferences.reducedMotion}
          onChange={(value) =>
            void updateProfile({ preferences: { reducedMotion: value } }).catch((err) =>
              toastError(err),
            )
          }
          title="Reducir el movimiento"
          hint="Quita las animaciones de entrada y las transiciones largas."
        />
      </div>

      <div className={styles.block}>
        <span className={styles.blockTitle}>Atajos</span>
        <div className={styles.shortcuts}>
          {shortcuts.map(([label, keys]) => (
            <Fragment key={label}>
              <span>{label}</span>
              <span className={styles.key}>{keys}</span>
            </Fragment>
          ))}
        </div>
      </div>

      <div className={styles.about}>
        <span>
          {brand.name} · {brand.tagline}
        </span>
        <span>{brand.idea}</span>
      </div>
    </>
  );
}

/* ------------------------------ Audio y vídeo ------------------------------- */

function MediaSection() {
  const [devices, setDevices] = useState<{ audio: DeviceOption[]; video: DeviceOption[] }>({
    audio: [],
    video: [],
  });
  const [preferred, setPreferred] = useState(getPreferredDevices());
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const load = async () => {
    try {
      setDevices(await listDevices());
    } catch {
      setDevices({ audio: [], video: [] });
    }
  };

  useEffect(() => {
    void load();
    return () => stopRef.current?.();
  }, []);

  const choose = (kind: 'audioInput' | 'videoInput', deviceId: string) => {
    setPreferredDevice(kind, deviceId || null);
    setPreferred(getPreferredDevices());
  };

  /** Prueba real: abre el micrófono elegido y mide lo que entra. */
  const test = async () => {
    if (testing) {
      stopRef.current?.();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: preferred.audioInput ? { deviceId: { ideal: preferred.audioInput } } : true,
      });
      await load(); // Con permiso ya concedido, los nombres reales aparecen.

      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);

      const timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) {
          const value = (sample - 128) / 128;
          sum += value * value;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 6));
      }, 80);

      setTesting(true);
      stopRef.current = () => {
        window.clearInterval(timer);
        source.disconnect();
        void context.close().catch(() => undefined);
        for (const track of stream.getTracks()) track.stop();
        setTesting(false);
        setLevel(0);
        stopRef.current = null;
      };
    } catch (err) {
      toastError(err, 'No se pudo abrir el micrófono');
    }
  };

  return (
    <>
      <div className={styles.block}>
        <SettingRow title="Micrófono" hint="Se usará en llamadas y salas de voz.">
          <select
            className={styles.select}
            value={preferred.audioInput ?? ''}
            onChange={(event) => choose('audioInput', event.target.value)}
            aria-label="Micrófono"
          >
            <option value="">Predeterminado del sistema</option>
            {devices.audio.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow title="Nivel de entrada" hint="Habla para comprobar que se te oye.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 280 }}>
            <div className={styles.meter}>
              <span className={styles.meterFill} style={{ transform: `scaleX(${level})` }} />
            </div>
            <Button size="sm" onClick={test}>
              {testing ? 'Parar' : 'Probar'}
            </Button>
          </div>
        </SettingRow>
      </div>

      <div className={styles.block}>
        <SettingRow title="Cámara" hint="La que se abre al activar vídeo.">
          <select
            className={styles.select}
            value={preferred.videoInput ?? ''}
            onChange={(event) => choose('videoInput', event.target.value)}
            aria-label="Cámara"
          >
            <option value="">Predeterminada del sistema</option>
            {devices.video.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>

      {devices.audio.length === 0 && devices.video.length === 0 ? (
        <p className={styles.sessionMeta}>
          Los nombres de tus dispositivos aparecen cuando el navegador tiene permiso. Pulsa
          «Probar» y acepta para verlos.
        </p>
      ) : null}
    </>
  );
}

/* -------------------------------- Seguridad --------------------------------- */

interface SessionInfo {
  id: string;
  userAgent: string | null;
  createdAt: string;
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
    <>
      <div className={styles.block}>
        <span className={styles.blockTitle}>Contraseña</span>

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
      </div>

      <div className={styles.block}>
        <span className={styles.blockTitle}>Sesiones abiertas</span>
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
                  setSessions((list) => list?.filter((item) => item.id !== session.id) ?? null);
                } catch (err) {
                  toastError(err);
                }
              }}
            >
              <LogOut size={15} />
            </IconButton>
          </div>
        ))}

        <div className={styles.danger}>
          <Button variant="danger" onClick={closeAll}>
            Cerrar todas las sesiones
          </Button>
        </div>
      </div>
    </>
  );
}
