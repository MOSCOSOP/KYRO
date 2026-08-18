import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { LIMITS } from '@kyro/shared';
import type { UserActivity } from '@kyro/shared';
import { useSession } from '@/store/session';
import { toastError, toastOk } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Counter, Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import styles from './CustomStatusModal.module.css';

const ACTIVITY_PRESETS: { emoji: string; label: string; kind: UserActivity['kind'] }[] = [
  { emoji: '🎮', label: 'Jugando', kind: 'gaming' },
  { emoji: '💻', label: 'Programando', kind: 'working' },
  { emoji: '📚', label: 'Estudiando', kind: 'studying' },
  { emoji: '🎵', label: 'Escuchando música', kind: 'music' },
];

const EXPIRIES: { label: string; minutes: number | null }[] = [
  { label: 'Hasta que lo quite', minutes: null },
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '4 horas', minutes: 240 },
];

export function CustomStatusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);

  const [emoji, setEmoji] = useState('');
  const [text, setText] = useState('');
  const [expiry, setExpiry] = useState<number | null>(null);
  const [activity, setActivity] = useState<UserActivity['kind'] | null>(null);
  const [activityName, setActivityName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setEmoji(user.customStatus?.emoji ?? '');
    setText(user.customStatus?.text ?? '');
    setExpiry(null);
    setActivity(user.activity?.kind ?? null);
    setActivityName(user.activity?.name ?? '');
  }, [open, user]);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        customStatus:
          emoji || text
            ? {
                emoji: emoji || null,
                text: text || null,
                expiresAt: expiry ? new Date(Date.now() + expiry * 60_000).toISOString() : null,
              }
            : null,
        activity:
          activity && activityName.trim()
            ? {
                kind: activity,
                name: activityName.trim().slice(0, 60),
                details: null,
                startedAt: new Date().toISOString(),
              }
            : null,
      });
      toastOk('Estado actualizado');
      onClose();
    } catch (err) {
      toastError(err, 'No se pudo guardar tu estado');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await updateProfile({ customStatus: null, activity: null });
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tu estado"
      description="Se muestra junto a tu nombre, de forma discreta."
      footer={
        <>
          <Button variant="ghost" onClick={clear} disabled={saving}>
            Quitar
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className={styles.row}>
        <Input
          className={styles.emoji}
          value={emoji}
          onChange={(event) => setEmoji(event.target.value.slice(0, 4))}
          placeholder="🙂"
          aria-label="Emoji del estado"
        />
        <div className={styles.grow}>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, LIMITS.customStatus.max))}
            placeholder="¿Qué estás haciendo?"
            aria-label="Texto del estado"
            maxLength={LIMITS.customStatus.max}
          />
        </div>
      </div>
      <Counter value={text.length} max={LIMITS.customStatus.max} />

      <div>
        <span className={styles.sectionTitle}>Caduca</span>
        <div className={styles.expiry} style={{ marginTop: 8 }}>
          {EXPIRIES.map((option) => (
            <button
              key={option.label}
              type="button"
              className={clsx(styles.preset, expiry === option.minutes && styles.presetActive)}
              onClick={() => setExpiry(option.minutes)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={styles.sectionTitle}>Actividad</span>
        <div className={styles.presets} style={{ marginTop: 8 }}>
          {ACTIVITY_PRESETS.map((preset) => (
            <button
              key={preset.kind}
              type="button"
              className={clsx(styles.preset, activity === preset.kind && styles.presetActive)}
              onClick={() => {
                if (activity === preset.kind) {
                  setActivity(null);
                  setActivityName('');
                } else {
                  setActivity(preset.kind);
                  setActivityName((current) => current || preset.label);
                }
              }}
            >
              <span aria-hidden>{preset.emoji}</span>
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {activity ? (
        <Field label="Detalle de la actividad">
          {(id) => (
            <Input
              id={id}
              value={activityName}
              onChange={(event) => setActivityName(event.target.value.slice(0, 60))}
              placeholder="Valorant, Kyro, Cálculo II…"
            />
          )}
        </Field>
      ) : null}
    </Modal>
  );
}
