import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Community, Conversation } from '@kyro/shared';
import { LIMITS } from '@kyro/shared';
import { api } from '@/lib/api';
import { useChat } from '@/store/chat';
import { useCommunities } from '@/store/communities';
import { toastError, toastOk } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

/**
 * Continuidad: un grupo que crece se convierte en comunidad sin perder su
 * historia — el grupo pasa a ser el canal general.
 */
export function PromoteToCommunityModal({
  conversation,
  open,
  onClose,
}: {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setName(conversation.name ?? '');
      setDescription('');
      setIsPublic(false);
    }
  }, [open, conversation.name]);

  const submit = async () => {
    setBusy(true);
    try {
      const community = await api.post<Community>(
        `/conversations/${conversation.id}/promote-to-community`,
        { name: name.trim() || undefined, description: description.trim() || undefined, isPublic },
      );
      await useCommunities.getState().load();
      await useChat.getState().loadConversations();
      toastOk('Comunidad creada', 'Tu grupo ahora es el canal general');
      onClose();
      navigate(`/comunidades/${community.id}`);
    } catch (err) {
      toastError(err, 'No se pudo convertir el grupo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convertir en comunidad"
      description="Se conservan los mensajes y los miembros. El grupo pasará a ser el canal general."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Convertir
          </Button>
        </>
      }
    >
      <Field label="Nombre de la comunidad">
        {(id) => (
          <Input
            id={id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={LIMITS.communityName.max}
            placeholder="Gaming Perú"
          />
        )}
      </Field>

      <Field label="Descripción" hint="Opcional. Ayuda a que la gente sepa de qué va.">
        {(id) => (
          <Textarea
            id={id}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={LIMITS.communityDescription.max}
            placeholder="Partidas, clips y quedadas."
          />
        )}
      </Field>

      <Switch
        checked={isPublic}
        onChange={setIsPublic}
        title="Comunidad pública"
        hint="Cualquiera podrá encontrarla y unirse."
      />
    </Modal>
  );
}
