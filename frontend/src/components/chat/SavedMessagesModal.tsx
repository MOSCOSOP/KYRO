import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import type { Message } from '@kyro/shared';
import { api } from '@/lib/api';
import { shortStamp } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, Loading } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import styles from './NewConversationModal.module.css';

/** Los mensajes que guardaste, vengan de donde vengan. */
export function SavedMessagesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<Message[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setItems(null);
    api
      .get<{ items: Message[] }>('/messages/saved')
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mensajes guardados"
      description="Tu sitio para lo que no quieres perder."
    >
      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={20} />}
          title="Todavía no has guardado nada"
          description="Usa «Guardar mensaje» en el menú de cualquier mensaje."
        />
      ) : (
        <div className={styles.people}>
          {items.map((message) => (
            <button
              key={message.id}
              type="button"
              className={styles.person}
              onClick={() => {
                onClose();
                navigate(`/mensajes/${message.conversationId}`);
              }}
            >
              <Avatar user={message.author} size="md" />
              <span className={styles.personText}>
                <span className={styles.personName}>
                  {message.content || 'Mensaje con archivos'}
                </span>
                <span className={styles.personHandle}>
                  {message.author?.displayName ?? 'Alguien'} · {shortStamp(message.createdAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
