import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Check } from 'lucide-react';
import { LIMITS, type PresenceStatus } from '@kyro/shared';
import { uploadFile } from '@/lib/api';
import { brand, pageTitle } from '@/config/brand';
import { PRESENCE_LABEL } from '@/lib/format';
import { useSession } from '@/store/session';
import { toastError } from '@/store/ui';
import { Avatar, PresenceDot } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AuthField } from './AuthField';
import { AuthLayout } from './AuthLayout';
import styles from './Auth.module.css';

const STATUSES: Exclude<PresenceStatus, 'offline' | 'invisible'>[] = ['available', 'away', 'dnd'];

/**
 * Dos pasos y dentro. Nada aquí es obligatorio: es afinar la identidad que ya
 * se creó en el registro, no un tutorial.
 */
export function Onboarding() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  const [step, setStep] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [presence, setPresence] = useState<PresenceStatus>('available');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = pageTitle('Bienvenida');
  }, []);

  if (!user) return null;

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { attachment } = await uploadFile(file, { scope: 'avatar' });
      await updateProfile({ avatarUrl: attachment.url });
    } catch (err) {
      toastError(err, 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await updateProfile({
        onboarded: true,
        status: presence as Exclude<PresenceStatus, 'offline'>,
        customStatus: statusText.trim()
          ? { emoji: null, text: statusText.trim(), expiresAt: null }
          : null,
      });
    } catch (err) {
      toastError(err, 'No se pudo guardar tu perfil');
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      statement={['Configura', 'tu identidad.']}
      support="Cómo te verán los demás en KYRO. Todo esto se puede cambiar después."
    >
      {step === 0 ? (
        <>
          <header className={styles.head}>
            <h2 className={styles.title}>Tu presencia</h2>
            <p className={styles.subtitle}>Una foto y en qué andas. Opcional.</p>
          </header>

          <div className={styles.stepPanel}>
            <div className={styles.identity}>
              <button
                type="button"
                className={styles.avatarPick}
                onClick={() => fileRef.current?.click()}
                aria-label="Elegir foto de perfil"
                disabled={uploading}
              >
                <Avatar user={user} size="xl" />
              </button>
              <div className={styles.avatarHint}>
                <span className={styles.avatarTitle}>{user.displayName}</span>
                <span className={styles.readyHandle}>@{user.username}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Camera size={14} />}
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {user.avatarUrl ? 'Cambiar foto' : 'Subir foto'}
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(event) => void pickAvatar(event.target.files?.[0])}
              />
            </div>

            <AuthField
              label="¿En qué andas?"
              value={statusText}
              onChange={(event) => setStatusText(event.target.value)}
              maxLength={LIMITS.customStatus.max}
              hint="Aparecerá junto a tu nombre."
            />

            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Omitir
              </Button>
              <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => setStep(1)}>
                Continuar
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <header className={styles.head}>
            <h2 className={styles.title}>Cómo quieres aparecer</h2>
            <p className={styles.subtitle}>Puedes cambiarlo en cualquier momento.</p>
          </header>

          <div className={styles.stepPanel}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {STATUSES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.markRow}
                  onClick={() => setPresence(option)}
                  style={{
                    justifyContent: 'flex-start',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${
                      presence === option ? 'var(--accent-border)' : 'var(--border)'
                    }`,
                    background: presence === option ? 'var(--accent-softer)' : 'transparent',
                    color: presence === option ? 'var(--text)' : 'var(--text-secondary)',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <PresenceDot status={option} size="md" />
                  {PRESENCE_LABEL[option]}
                  {presence === option ? (
                    <Check size={15} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
                  ) : null}
                </button>
              ))}
            </div>

            <p className={styles.legal}>
              {brand.name} está listo. Entrarás directamente a tus conversaciones.
            </p>

            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setStep(0)} disabled={saving}>
                Atrás
              </Button>
              <Button variant="primary" onClick={finish} loading={saving}>
                Entrar
              </Button>
            </div>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
