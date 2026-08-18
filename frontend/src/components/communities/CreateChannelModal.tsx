import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { LIMITS } from '@kyro/shared';
import { useCommunities } from '@/store/communities';
import { toastError } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import styles from './Communities.module.css';
import tabs from '@/components/chat/NewConversationModal.module.css';

type Kind = 'text' | 'announcement' | 'voice' | 'meeting' | 'gaming';

const OPTIONS: { kind: Kind; label: string; hint: string }[] = [
  { kind: 'text', label: '# Canal de texto', hint: 'Conversación escrita, como cualquier chat.' },
  { kind: 'announcement', label: '📢 Anuncios', hint: 'Solo el equipo publica; todos leen.' },
  { kind: 'voice', label: '🔊 Sala de voz', hint: 'Entra y sal cuando quieras.' },
  { kind: 'meeting', label: '🎙️ Reunión', hint: 'Para encuentros con más estructura.' },
  { kind: 'gaming', label: '🎮 Gaming', hint: 'Para jugar y compartir pantalla.' },
];

export function CreateChannelModal({
  communityId,
  open,
  onClose,
}: {
  communityId: string;
  open: boolean;
  onClose: () => void;
}) {
  const createChannel = useCommunities((state) => state.createChannel);
  const createRoom = useCommunities((state) => state.createRoom);
  const [kind, setKind] = useState<Kind>('text');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('text');
    setName('');
    setTopic('');
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (kind === 'text' || kind === 'announcement') {
        await createChannel(communityId, {
          name: name.trim(),
          kind,
          topic: topic.trim() || undefined,
        });
      } else {
        await createRoom(communityId, {
          name: name.trim(),
          kind,
          topic: topic.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      toastError(err, 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Añadir a la comunidad"
      description="Los canales son para escribir; las salas, para hablar."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            Crear
          </Button>
        </>
      }
    >
      <div className={styles.section}>
        {OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={clsx(tabs.person, kind === option.kind && tabs.tabActive)}
            onClick={() => setKind(option.kind)}
          >
            <span className={tabs.personText}>
              <span className={tabs.personName}>{option.label}</span>
              <span className={tabs.personHandle}>{option.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <Field label="Nombre">
        {(id) => (
          <Input
            id={id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={LIMITS.channelName.max}
            placeholder={kind === 'text' ? 'general' : 'Voz general'}
            autoFocus
          />
        )}
      </Field>

      <Field label="Tema" hint="Opcional. Una línea sobre de qué va.">
        {(id) => (
          <Input
            id={id}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={LIMITS.topic.max}
            placeholder="Clips, dudas, presentaciones…"
          />
        )}
      </Field>
    </Modal>
  );
}
