import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Hash, Search, Users } from 'lucide-react';
import type { Message } from '@kyro/shared';
import { api } from '@/lib/api';
import { conversationName, otherMember } from '@/lib/conversation';
import { useChat } from '@/store/chat';
import { useSession } from '@/store/session';
import { toastError, toastOk } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import styles from './NewConversationModal.module.css';

/**
 * Reenviar un mensaje. El servidor copia el contenido y reutiliza los archivos
 * ya subidos, así que da igual el tamaño del adjunto: no se sube nada otra vez.
 */
export function ForwardModal({
  message,
  onClose,
}: {
  message: Message | null;
  onClose: () => void;
}) {
  const selfId = useSession((state) => state.user?.id ?? '');
  const conversations = useChat((state) => state.conversations);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (message) {
      setQuery('');
      setSelected([]);
    }
  }, [message]);

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    return conversations
      .filter((conversation) => conversation.id !== message?.conversationId)
      .filter((conversation) =>
        term ? conversationName(conversation, selfId).toLowerCase().includes(term) : true,
      )
      .slice(0, 40);
  }, [conversations, query, selfId, message]);

  if (!message) return null;

  const send = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      await api.post(`/messages/${message.id}/forward`, { conversationIds: selected });
      toastOk(
        selected.length === 1 ? 'Mensaje reenviado' : `Reenviado a ${selected.length} conversaciones`,
      );
      onClose();
    } catch (err) {
      toastError(err, 'No se pudo reenviar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Reenviar"
      description={message.content ? `«${message.content.slice(0, 80)}»` : 'Mensaje con archivos'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={send} loading={busy} disabled={selected.length === 0}>
            Reenviar{selected.length > 1 ? ` (${selected.length})` : ''}
          </Button>
        </>
      }
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar conversación"
        aria-label="Buscar conversación"
        icon={<Search size={15} />}
      />

      <div className={styles.people}>
        {options.length === 0 ? (
          <EmptyState title="No hay dónde reenviarlo" description="Abre una conversación primero." />
        ) : (
          options.map((conversation) => {
            const checked = selected.includes(conversation.id);
            const peer = otherMember(conversation, selfId);
            return (
              <button
                key={conversation.id}
                type="button"
                className={styles.person}
                onClick={() =>
                  setSelected((current) =>
                    checked
                      ? current.filter((id) => id !== conversation.id)
                      : [...current, conversation.id],
                  )
                }
              >
                {conversation.type === 'direct' && peer ? (
                  <Avatar user={peer} size="md" presence />
                ) : conversation.type === 'channel' ? (
                  <span className={styles.check} style={{ border: 'none' }}>
                    <Hash size={16} />
                  </span>
                ) : (
                  <span className={styles.check} style={{ border: 'none' }}>
                    <Users size={16} />
                  </span>
                )}
                <span className={styles.personText}>
                  <span className={styles.personName}>
                    {conversationName(conversation, selfId)}
                  </span>
                  <span className={styles.personHandle}>
                    {conversation.type === 'direct'
                      ? `@${peer?.username ?? ''}`
                      : `${conversation.memberCount} personas`}
                  </span>
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
