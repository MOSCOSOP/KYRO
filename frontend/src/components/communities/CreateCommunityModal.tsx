import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIMITS } from '@kyro/shared';
import { useCommunities } from '@/store/communities';
import { toastError } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

export function CreateCommunityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCommunities((state) => state.create);
  const join = useCommunities((state) => state.join);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setIsPublic(true);
    setCode('');
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const community = await create({
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
      });
      onClose();
      navigate(`/comunidades/${community.id}`);
    } catch (err) {
      toastError(err, 'No se pudo crear la comunidad');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const community = await join({ code: code.trim() });
      onClose();
      navigate(`/comunidades/${community.id}`);
    } catch (err) {
      toastError(err, 'Ese código no es válido');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva comunidad"
      description="Un espacio con canales, salas de voz y encuentros."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            Crear comunidad
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        {(id) => (
          <Input
            id={id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={LIMITS.communityName.max}
            placeholder="Gaming Perú"
            autoFocus
          />
        )}
      </Field>

      <Field label="Descripción" hint="Opcional">
        {(id) => (
          <Textarea
            id={id}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={LIMITS.communityDescription.max}
            placeholder="Partidas, clips y quedadas. Todos bienvenidos."
          />
        )}
      </Field>

      <Switch
        checked={isPublic}
        onChange={setIsPublic}
        title="Comunidad pública"
        hint="Aparecerá en «Descubrir» y cualquiera podrá unirse."
      />

      <Field label="¿Tienes un código de invitación?">
        {(id) => (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              id={id}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="a1b2c3d4"
            />
            <Button onClick={submitCode} disabled={!code.trim() || busy}>
              Unirme
            </Button>
          </div>
        )}
      </Field>
    </Modal>
  );
}
