import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Compass, UserPlus } from 'lucide-react';
import type { Community, PublicUser } from '@kyro/shared';
import { LIMITS } from '@kyro/shared';
import { api, uploadFile } from '@/lib/api';
import { brand, pageTitle } from '@/config/brand';
import { useSession } from '@/store/session';
import { useCommunities } from '@/store/communities';
import { toastError } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import styles from './Auth.module.css';

/**
 * Tres pasos, todos saltables: foto y estado, gente, comunidad.
 * Nada de tutoriales largos: el objetivo es entrar en KYRO.
 */
export function Onboarding() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = pageTitle('Bienvenida');
  }, []);

  const finish = async () => {
    setSaving(true);
    try {
      await updateProfile({ onboarded: true });
    } catch (err) {
      toastError(err, 'No se pudo terminar la configuración');
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${styles.wide}`}>
        <header className={styles.brand}>
          <span className={styles.wordmark}>{brand.name}</span>
          <span className={styles.tagline}>{brand.tagline}</span>
        </header>

        <div className={styles.steps} aria-label={`Paso ${step + 1} de 3`}>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`${styles.step} ${index <= step ? styles.stepActive : ''}`}
            />
          ))}
        </div>

        <div className={styles.panel}>
          {step === 0 ? <ProfileStep /> : null}
          {step === 1 ? <PeopleStep /> : null}
          {step === 2 ? <CommunityStep /> : null}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => (step === 2 ? finish() : setStep(step + 1))}>
              {step === 2 ? 'Ahora no' : 'Saltar'}
            </Button>
            {step === 2 ? (
              <Button variant="primary" onClick={finish} loading={saving}>
                Entrar a {brand.name}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Continuar
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function ProfileStep() {
  const user = useSession((state) => state.user);
  const updateProfile = useSession((state) => state.updateProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(user?.customStatus?.text ?? '');

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

  return (
    <>
      <div>
        <h1 className={styles.title}>Un toque tuyo</h1>
        <p className={styles.subtitle}>Todo esto es opcional; puedes cambiarlo cuando quieras.</p>
      </div>

      <div className={styles.avatarPicker}>
        <Avatar user={user} size="xl" />
        <div>
          <Button
            icon={<Camera size={16} />}
            onClick={() => fileRef.current?.click()}
            loading={uploading}
          >
            Subir foto
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => void pickAvatar(event.target.files?.[0])}
          />
        </div>
      </div>

      <Field label="¿Qué estás haciendo?" hint="Aparecerá junto a tu nombre.">
        {(id) => (
          <Input
            id={id}
            value={status}
            maxLength={LIMITS.customStatus.max}
            placeholder="Construyendo cosas"
            onChange={(event) => setStatus(event.target.value)}
            onBlur={() => {
              if (status.trim()) {
                void updateProfile({
                  customStatus: { emoji: null, text: status.trim(), expiresAt: null },
                }).catch(() => undefined);
              }
            }}
          />
        )}
      </Field>
    </>
  );
}

function PeopleStep() {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const path = query.trim().length >= 2 ? '/users/search' : '/users/suggested';
        const data = await api.get<{ items: PublicUser[] }>(path, {
          query: query.trim().length >= 2 ? { q: query.trim() } : undefined,
        });
        if (!cancelled) setPeople(data.items);
      } catch {
        if (!cancelled) setPeople([]);
      }
    };
    const timer = window.setTimeout(load, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const addContact = async (person: PublicUser) => {
    try {
      await api.post('/users/contacts', { userId: person.id });
      setAdded((current) => ({ ...current, [person.id]: true }));
    } catch (err) {
      toastError(err, 'No se pudo enviar la solicitud');
    }
  };

  return (
    <>
      <div>
        <h1 className={styles.title}>Encuentra a tu gente</h1>
        <p className={styles.subtitle}>Busca por nombre o @usuario.</p>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar personas"
        aria-label="Buscar personas"
      />

      <div className={styles.people}>
        {people.length === 0 ? (
          <EmptyState
            icon={<UserPlus size={20} />}
            title="Nadie por aquí todavía"
            description="Cuando haya más gente en tu KYRO aparecerá en esta lista."
          />
        ) : (
          people.map((person) => (
            <div key={person.id} className={styles.person}>
              <Avatar user={person} size="md" />
              <span className={styles.personText}>
                <span className={styles.personName}>{person.displayName}</span>
                <span className={styles.personHandle}>@{person.username}</span>
              </span>
              <Button
                size="sm"
                variant={added[person.id] ? 'ghost' : 'secondary'}
                disabled={added[person.id]}
                icon={added[person.id] ? <Check size={14} /> : <UserPlus size={14} />}
                onClick={() => void addContact(person)}
              >
                {added[person.id] ? 'Enviado' : 'Añadir'}
              </Button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function CommunityStep() {
  const create = useCommunities((state) => state.create);
  const join = useCommunities((state) => state.join);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [publicOnes, setPublicOnes] = useState<Community[]>([]);

  useEffect(() => {
    api
      .get<{ items: Community[] }>('/communities/discover')
      .then((data) => setPublicOnes(data.items.slice(0, 4)))
      .catch(() => setPublicOnes([]));
  }, []);

  const doCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await create({ name: name.trim() });
      setName('');
    } catch (err) {
      toastError(err, 'No se pudo crear la comunidad');
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async (target: { communityId?: string; code?: string }) => {
    setBusy(true);
    try {
      await join(target);
      setCode('');
    } catch (err) {
      toastError(err, 'No se pudo unir a la comunidad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <h1 className={styles.title}>Tu primera comunidad</h1>
        <p className={styles.subtitle}>Crea una o únete con un código de invitación.</p>
      </div>

      <Field label="Crear una comunidad">
        {(id) => (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Gaming Perú"
              maxLength={LIMITS.communityName.max}
            />
            <Button variant="primary" onClick={doCreate} loading={busy} disabled={!name.trim()}>
              Crear
            </Button>
          </div>
        )}
      </Field>

      <Field label="Unirse con un código">
        {(id) => (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              id={id}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="a1b2c3d4"
            />
            <Button onClick={() => doJoin({ code: code.trim() })} disabled={!code.trim() || busy}>
              Unirme
            </Button>
          </div>
        )}
      </Field>

      {publicOnes.length > 0 ? (
        <div className={styles.people}>
          {publicOnes.map((community) => (
            <div key={community.id} className={styles.person}>
              <Avatar name={community.name} src={community.iconUrl} size="md" square />
              <span className={styles.personText}>
                <span className={styles.personName}>{community.name}</span>
                <span className={styles.personHandle}>{community.memberCount} miembros</span>
              </span>
              <Button
                size="sm"
                icon={<Compass size={14} />}
                onClick={() => void doJoin({ communityId: community.id })}
                disabled={busy}
              >
                Unirme
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
