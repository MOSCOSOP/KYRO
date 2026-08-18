import { useEffect, useState } from 'react';
import type { CommunityDetail } from '@kyro/shared';
import { useCommunities } from '@/store/communities';
import { toastError, toastOk } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

function defaultStart() {
  const date = new Date(Date.now() + 24 * 3600_000);
  date.setMinutes(0, 0, 0);
  // Formato que espera <input type="datetime-local">.
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateEventModal({
  community,
  open,
  onClose,
}: {
  community: CommunityDetail;
  open: boolean;
  onClose: () => void;
}) {
  const createEvent = useCommunities((state) => state.createEvent);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [roomId, setRoomId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setStartsAt(defaultStart());
    setRoomId(community.rooms[0]?.id ?? '');
  }, [open, community.rooms]);

  const submit = async () => {
    if (!title.trim() || !startsAt) return;
    setBusy(true);
    try {
      await createEvent(community.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        startsAt: new Date(startsAt).toISOString(),
        roomId: roomId || null,
      });
      toastOk('Evento creado');
      onClose();
    } catch (err) {
      toastError(err, 'No se pudo crear el evento');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo encuentro"
      description="Avisa a la comunidad de cuándo y dónde."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!title.trim()}>
            Crear evento
          </Button>
        </>
      }
    >
      <Field label="Título">
        {(id) => (
          <Input
            id={id}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            placeholder="Torneo interno"
            autoFocus
          />
        )}
      </Field>

      <Field label="Cuándo">
        {(id) => (
          <Input
            id={id}
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        )}
      </Field>

      {community.rooms.length > 0 ? (
        <Field label="Dónde" hint="Opcional: una sala de la comunidad.">
          {(id) => (
            <select
              id={id}
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              style={{
                width: '100%',
                height: 38,
                padding: '0 12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
              }}
            >
              <option value="">Sin sala</option>
              {community.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <Field label="Detalles" hint="Opcional">
        {(id) => (
          <Textarea
            id={id}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="Formato eliminación directa. Trae tu mejor setup."
          />
        )}
      </Field>
    </Modal>
  );
}
