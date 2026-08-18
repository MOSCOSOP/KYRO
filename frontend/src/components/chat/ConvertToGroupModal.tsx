import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Search } from 'lucide-react';
import type { Conversation, PublicUser } from '@kyro/shared';
import { LIMITS } from '@kyro/shared';
import { api } from '@/lib/api';
import { useChat } from '@/store/chat';
import { toastError, toastOk } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import styles from './NewConversationModal.module.css';

/**
 * Continuidad: una conversación privada que crece se convierte en grupo
 * conservando todo lo hablado hasta ahora.
 */
export function ConvertToGroupModal({
  conversation,
  open,
  onClose,
}: {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setQuery('');
    setSelected([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const term = query.trim();
        const data = await api.get<{ items: PublicUser[] }>(
          term.length >= 2 ? '/users/search' : '/users/suggested',
          term.length >= 2 ? { query: { q: term } } : undefined,
        );
        const current = new Set(conversation.members.map((member) => member.id));
        if (!cancelled) setPeople(data.items.filter((person) => !current.has(person.id)));
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, conversation.members]);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const updated = await api.post<Conversation>(
        `/conversations/${conversation.id}/convert-to-group`,
        { name: name.trim(), memberIds: selected },
      );
      useChat.getState().applyConversation(updated);
      toastOk('Ahora es un grupo', 'Se conservan todos los mensajes');
      onClose();
    } catch (err) {
      toastError(err, 'No se pudo crear el grupo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crear un grupo"
      description="La conversación se conserva entera; solo se suma más gente."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            Crear grupo
          </Button>
        </>
      }
    >
      <Field label="Nombre del grupo">
        {(id) => (
          <Input
            id={id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={LIMITS.conversationName.max}
            placeholder="Proyecto nuevo"
            autoFocus
          />
        )}
      </Field>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Añadir personas"
        aria-label="Buscar personas"
        icon={<Search size={15} />}
      />

      <div className={styles.people}>
        {loading ? (
          <SkeletonList rows={3} />
        ) : people.length === 0 ? (
          <EmptyState title="Sin resultados" />
        ) : (
          people.map((person) => {
            const checked = selected.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                className={styles.person}
                onClick={() =>
                  setSelected((current) =>
                    checked ? current.filter((id) => id !== person.id) : [...current, person.id],
                  )
                }
              >
                <Avatar user={person} size="md" presence />
                <span className={styles.personText}>
                  <span className={styles.personName}>{person.displayName}</span>
                  <span className={styles.personHandle}>@{person.username}</span>
                </span>
                <span className={clsx(styles.check, checked && styles.checked)}>
                  <Check size={13} />
                </span>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
