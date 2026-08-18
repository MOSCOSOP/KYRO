import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, RefreshCw, Search } from 'lucide-react';
import type { Community, PublicUser } from '@kyro/shared';
import { can } from '@kyro/shared';
import { api } from '@/lib/api';
import { useCommunities } from '@/store/communities';
import { toastError, toastOk } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import people from '@/components/chat/NewConversationModal.module.css';
import styles from './Communities.module.css';

export function InviteModal({
  community,
  open,
  onClose,
}: {
  community: Community;
  open: boolean;
  onClose: () => void;
}) {
  const invite = useCommunities((state) => state.invite);
  const regenerate = useCommunities((state) => state.regenerateInvite);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [code, setCode] = useState(community.inviteCode ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(community.inviteCode ?? '');
      setQuery('');
      setInvited([]);
    }
  }, [open, community.inviteCode]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.get<{ items: PublicUser[] }>('/users/search', {
          query: { q: query.trim() },
        });
        if (!cancelled) setResults(data.items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const sendInvite = async (person: PublicUser) => {
    try {
      await invite(community.id, [person.id]);
      setInvited((current) => [...current, person.id]);
    } catch (err) {
      toastError(err, 'No se pudo invitar');
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toastOk('Código copiado');
    } catch {
      toastError(new Error('No se pudo copiar el código'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invitar a ${community.name}`}
      description="Comparte el código o invita a alguien directamente."
    >
      {code ? (
        <div className={styles.inviteRow}>
          <span className={styles.code}>{code}</span>
          <IconButton label="Copiar código" onClick={copyCode}>
            <Copy size={16} />
          </IconButton>
          {can(community.myRole, 'community.edit') ? (
            <IconButton
              label="Generar otro código"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setCode(await regenerate(community.id));
                  toastOk('Código actualizado');
                } catch (err) {
                  toastError(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={16} />
            </IconButton>
          ) : null}
        </div>
      ) : null}

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar personas"
        aria-label="Buscar personas"
        icon={<Search size={15} />}
      />

      <div className={people.people}>
        {loading ? (
          <SkeletonList rows={3} />
        ) : results.length === 0 ? (
          <EmptyState title="Busca a quien quieras invitar" />
        ) : (
          results.map((person) => {
            const done = invited.includes(person.id);
            return (
              <div key={person.id} className={people.person}>
                <Avatar user={person} size="md" presence />
                <span className={people.personText}>
                  <span className={people.personName}>{person.displayName}</span>
                  <span className={people.personHandle}>@{person.username}</span>
                </span>
                <Button
                  size="sm"
                  variant={done ? 'ghost' : 'secondary'}
                  disabled={done}
                  icon={done ? <Check size={14} /> : undefined}
                  onClick={() => void sendInvite(person)}
                  className={clsx(done && people.checked)}
                >
                  {done ? 'Invitado' : 'Invitar'}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
