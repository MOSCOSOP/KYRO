import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { CommunityDetail, CommunityMember, MemberRole } from '@kyro/shared';
import { LIMITS, ROLE_LABEL, can, outranks } from '@kyro/shared';
import { api } from '@/lib/api';
import { useCommunities } from '@/store/communities';
import { toastError, toastOk, useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { AccentPicker } from '@/components/ui/AccentPicker';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Loading } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import styles from './Communities.module.css';

export function CommunitySettingsModal({
  community,
  open,
  onClose,
}: {
  community: CommunityDetail;
  open: boolean;
  onClose: () => void;
}) {
  const update = useCommunities((state) => state.update);
  const setMuted = useCommunities((state) => state.setMuted);
  const setRole = useCommunities((state) => state.setRole);
  const kick = useCommunities((state) => state.kick);
  const members = useCommunities((state) => state.members[community.id]);
  const confirm = useUI((state) => state.confirm);
  const navigate = useNavigate();

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? '');
  const [isPublic, setIsPublic] = useState(community.isPublic);
  const [accent, setAccent] = useState<string | null>(community.accentColor);
  const [muted, setLocalMuted] = useState(community.muted);
  const [busy, setBusy] = useState(false);

  const role = community.myRole ?? 'member';
  const canEdit = can(role, 'community.edit');
  const canManageRoles = can(role, 'member.role');

  useEffect(() => {
    if (!open) return;
    setName(community.name);
    setDescription(community.description ?? '');
    setIsPublic(community.isPublic);
    setAccent(community.accentColor);
    setLocalMuted(community.muted);
    void useCommunities.getState().loadMembers(community.id).catch(() => undefined);
  }, [open, community]);

  const save = async () => {
    setBusy(true);
    try {
      if (canEdit) {
        await update(community.id, {
          name: name.trim(),
          description: description.trim() || null,
          isPublic,
          accentColor: accent,
        });
      }
      if (muted !== community.muted) await setMuted(community.id, muted);
      toastOk('Cambios guardados');
      onClose();
    } catch (err) {
      toastError(err, 'No se pudieron guardar los cambios');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `¿Eliminar ${community.name}?`,
      description: 'Se borrarán sus canales, mensajes y salas. No se puede deshacer.',
      confirmLabel: 'Eliminar comunidad',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/communities/${community.id}`);
      await useCommunities.getState().load();
      onClose();
      navigate('/comunidades');
    } catch (err) {
      toastError(err, 'No se pudo eliminar');
    }
  };

  const changeRole = async (member: CommunityMember, next: MemberRole) => {
    try {
      await setRole(community.id, member.user.id, next as Exclude<MemberRole, 'owner'>);
    } catch (err) {
      toastError(err, 'No se pudo cambiar el rol');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajustes de la comunidad"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        {(id) => (
          <Input
            id={id}
            value={name}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
            maxLength={LIMITS.communityName.max}
          />
        )}
      </Field>

      <Field label="Descripción">
        {(id) => (
          <Textarea
            id={id}
            value={description}
            disabled={!canEdit}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={LIMITS.communityDescription.max}
          />
        )}
      </Field>

      {canEdit ? (
        <Field label="Color de la comunidad">
          {() => (
            <AccentPicker
              label="Color de la comunidad"
              value={accent}
              onChange={setAccent}
            />
          )}
        </Field>
      ) : null}

      {canEdit ? (
        <Switch
          checked={isPublic}
          onChange={setIsPublic}
          title="Comunidad pública"
          hint="Aparece en «Descubrir» y cualquiera puede unirse."
        />
      ) : null}

      <Switch
        checked={muted}
        onChange={setLocalMuted}
        title="Silenciar la comunidad"
        hint="No recibirás notificaciones de sus canales."
      />

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Miembros</span>
        {!members ? (
          <Loading />
        ) : (
          members.map((member) => (
            <div key={member.user.id} className={styles.memberCard}>
              <Avatar user={member.user} size="sm" presence />
              <span className={styles.memberText}>
                <span className={styles.memberName}>{member.user.displayName}</span>
                <span className={styles.memberRole}>{ROLE_LABEL[member.role]}</span>
              </span>

              {canManageRoles && outranks(role, member.role) ? (
                <span className={styles.roleSelect}>
                  <Select
                    value={member.role}
                    onChange={(event) => void changeRole(member, event.target.value as MemberRole)}
                    aria-label={`Rol de ${member.user.displayName}`}
                  >
                    <option value="member">Miembro</option>
                    <option value="moderator">Moderador</option>
                    <option value="admin">Administrador</option>
                  </Select>
                </span>
              ) : null}

              {can(role, 'member.kick') && outranks(role, member.role) ? (
                <IconButton
                  label={`Expulsar a ${member.user.displayName}`}
                  size="sm"
                  danger
                  onClick={() => void kick(community.id, member.user.id).catch(toastError)}
                >
                  <Trash2 size={14} />
                </IconButton>
              ) : null}
            </div>
          ))
        )}
      </div>

      {can(role, 'community.delete') ? (
        <Button variant="danger" icon={<Trash2 size={16} />} onClick={remove}>
          Eliminar comunidad
        </Button>
      ) : null}
    </Modal>
  );
}
