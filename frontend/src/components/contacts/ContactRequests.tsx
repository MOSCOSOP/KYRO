import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Contact } from '@kyro/shared';
import { api } from '@/lib/api';
import { useChat } from '@/store/chat';
import { toastError, toastOk } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import styles from '@/routes/Activity.module.css';

/**
 * Solicitudes de contacto pendientes. Solo aparece cuando hay alguna:
 * las invitaciones se resuelven donde se ven.
 */
export function ContactRequests() {
  const [pending, setPending] = useState<Contact[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: Contact[] }>('/users/contacts');
      setPending(data.items.filter((contact) => contact.status === 'pending' && !contact.outgoing));
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (contact: Contact, action: 'accept' | 'decline') => {
    setBusyId(contact.id);
    try {
      await api.post(`/users/contacts/${contact.id}/respond`, { action });
      setPending((current) => current.filter((item) => item.id !== contact.id));
      if (action === 'accept') {
        toastOk(`${contact.user.displayName} ya está en tus contactos`);
        await useChat.getState().loadConversations().catch(() => undefined);
      }
    } catch (err) {
      toastError(err, 'No se pudo responder a la solicitud');
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <>
      {pending.map((contact) => (
        <div key={contact.id} className={`${styles.item} ${styles.unread}`}>
          <Avatar user={contact.user} size="md" presence />
          <div className={styles.body}>
            <span className={styles.itemTitle}>
              {contact.user.displayName} quiere conectar contigo
            </span>
            <span className={styles.itemBody}>@{contact.user.username}</span>
          </div>
          <Button
            size="sm"
            variant="primary"
            icon={<Check size={14} />}
            loading={busyId === contact.id}
            onClick={() => void respond(contact, 'accept')}
          >
            Aceptar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<X size={14} />}
            disabled={busyId === contact.id}
            onClick={() => void respond(contact, 'decline')}
          >
            Rechazar
          </Button>
        </div>
      ))}
    </>
  );
}
