import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Check, Search, X } from 'lucide-react';
import type { Contact, Conversation, PublicUser } from '@kyro/shared';
import { LIMITS } from '@kyro/shared';
import { api } from '@/lib/api';
import { useChat } from '@/store/chat';
import { toastError } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import styles from './NewConversationModal.module.css';

type Mode = 'direct' | 'group';

export function NewConversationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('direct');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected([]);
    setGroupName('');
    setMode('direct');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const term = query.trim();
        if (term.length >= 2) {
          const data = await api.get<{ items: PublicUser[] }>('/users/search', {
            query: { q: term },
          });
          if (!cancelled) setPeople(data.items);
        } else {
          // Sin búsqueda, se ofrecen los contactos ya aceptados.
          const data = await api.get<{ items: Contact[] }>('/users/contacts');
          if (!cancelled) {
            setPeople(
              data.items
                .filter((contact) => contact.status === 'accepted')
                .map((contact) => contact.user),
            );
          }
        }
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
  }, [query, open]);

  const openDirect = async (person: PublicUser) => {
    setBusy(true);
    try {
      const conversation = await api.post<Conversation>('/conversations/direct', {
        userId: person.id,
      });
      useChat.getState().applyConversation(conversation);
      onClose();
      navigate(`/mensajes/${conversation.id}`);
    } catch (err) {
      toastError(err, 'No se pudo abrir la conversación');
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || selected.length === 0) return;
    setBusy(true);
    try {
      const conversation = await api.post<Conversation>('/conversations/group', {
        name: groupName.trim(),
        memberIds: selected.map((person) => person.id),
      });
      useChat.getState().applyConversation(conversation);
      onClose();
      navigate(`/mensajes/${conversation.id}`);
    } catch (err) {
      toastError(err, 'No se pudo crear el grupo');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (person: PublicUser) => {
    setSelected((current) =>
      current.some((item) => item.id === person.id)
        ? current.filter((item) => item.id !== person.id)
        : [...current, person],
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva conversación"
      description="Habla con alguien o reúne a un grupo."
      footer={
        mode === 'group' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={createGroup}
              loading={busy}
              disabled={!groupName.trim() || selected.length === 0}
            >
              Crear grupo
            </Button>
          </>
        ) : undefined
      }
    >
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'direct'}
          className={clsx(styles.tab, mode === 'direct' && styles.tabActive)}
          onClick={() => setMode('direct')}
        >
          Mensaje directo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'group'}
          className={clsx(styles.tab, mode === 'group' && styles.tabActive)}
          onClick={() => setMode('group')}
        >
          Grupo
        </button>
      </div>

      {mode === 'group' ? (
        <Field label="Nombre del grupo">
          {(id) => (
            <Input
              id={id}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Equipo Producto"
              maxLength={LIMITS.conversationName.max}
            />
          )}
        </Field>
      ) : null}

      {selected.length > 0 ? (
        <div className={styles.chips}>
          {selected.map((person) => (
            <span key={person.id} className={styles.chip}>
              {person.displayName}
              <IconButton label={`Quitar a ${person.displayName}`} size="sm" onClick={() => toggle(person)}>
                <X size={12} />
              </IconButton>
            </span>
          ))}
        </div>
      ) : null}

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre o @usuario"
        aria-label="Buscar personas"
        icon={<Search size={15} />}
      />

      <div className={styles.people}>
        {loading ? (
          <SkeletonList rows={4} />
        ) : people.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description="Busca por nombre o por @usuario para encontrar a alguien."
          />
        ) : (
          people.map((person) => {
            const checked = selected.some((item) => item.id === person.id);
            return (
              <button
                key={person.id}
                type="button"
                className={styles.person}
                disabled={busy}
                onClick={() => (mode === 'direct' ? void openDirect(person) : toggle(person))}
              >
                <Avatar user={person} size="md" presence />
                <span className={styles.personText}>
                  <span className={styles.personName}>{person.displayName}</span>
                  <span className={styles.personHandle}>@{person.username}</span>
                </span>
                {mode === 'group' ? (
                  <span className={clsx(styles.check, checked && styles.checked)}>
                    <Check size={13} />
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
