import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Plus, Users } from 'lucide-react';
import type { Community } from '@kyro/shared';
import { api } from '@/lib/api';
import { useCommunities } from '@/store/communities';
import { toastError } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { CreateCommunityModal } from './CreateCommunityModal';
import styles from './Communities.module.css';

/** Panel lateral con tus comunidades y las públicas por descubrir. */
export function CommunityListPanel({ activeId }: { activeId?: string }) {
  const communities = useCommunities((state) => state.communities);
  const loaded = useCommunities((state) => state.loaded);
  const join = useCommunities((state) => state.join);
  const [discover, setDiscover] = useState<Community[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: Community[] }>('/communities/discover')
      .then((data) => setDiscover(data.items))
      .catch(() => setDiscover([]));
  }, [communities.length]);

  const doJoin = async (community: Community) => {
    setBusyId(community.id);
    try {
      await join({ communityId: community.id });
      setDiscover((current) => current.filter((item) => item.id !== community.id));
    } catch (err) {
      toastError(err, 'No se pudo unir a la comunidad');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.title}>Comunidades</span>
        <IconButton label="Crear comunidad" onClick={() => setCreateOpen(true)}>
          <Plus size={18} />
        </IconButton>
      </header>

      <div className={styles.scroll}>
        {!loaded ? (
          <SkeletonList rows={4} />
        ) : communities.length === 0 ? (
          <EmptyState
            icon={<Users size={20} />}
            title="Todavía sin comunidades"
            description="Crea la tuya o únete a una pública para empezar."
            action={
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                Crear comunidad
              </Button>
            }
          />
        ) : (
          communities.map((community) => (
            <Link
              key={community.id}
              to={`/comunidades/${community.id}`}
              className={`${styles.communityRow} ${community.id === activeId ? styles.itemActive : ''}`}
            >
              <Avatar name={community.name} src={community.iconUrl} size="md" square />
              <span className={styles.communityText}>
                <span className={styles.communityName}>{community.name}</span>
                <span className={styles.communityMeta}>
                  {community.memberCount} miembros
                  {community.onlineCount > 0 ? ` · ${community.onlineCount} en línea` : ''}
                </span>
              </span>
            </Link>
          ))
        )}

        {discover.length > 0 ? (
          <div className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.groupTitle}>Descubrir</span>
            </div>
            {discover.map((community) => (
              <div key={community.id} className={styles.communityRow}>
                <Avatar name={community.name} src={community.iconUrl} size="md" square />
                <span className={styles.communityText}>
                  <span className={styles.communityName}>{community.name}</span>
                  <span className={styles.communityMeta}>{community.memberCount} miembros</span>
                </span>
                <Button
                  size="sm"
                  icon={<Compass size={14} />}
                  loading={busyId === community.id}
                  onClick={() => void doJoin(community)}
                >
                  Unirme
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
