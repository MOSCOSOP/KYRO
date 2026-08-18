import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import type { Call } from '@kyro/shared';
import { api } from '@/lib/api';
import { pageTitle } from '@/config/brand';
import { duration, relative } from '@/lib/format';
import { useCalls } from '@/store/calls';
import { useSession } from '@/store/session';
import { toastError } from '@/store/ui';
import { Workspace } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import styles from './Activity.module.css';

export function Calls() {
  const selfId = useSession((state) => state.user?.id ?? '');
  const [calls, setCalls] = useState<Call[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = pageTitle('Llamadas');
    api
      .get<{ items: Call[] }>('/calls')
      .then((data) => setCalls(data.items))
      .catch((err) => {
        toastError(err, 'No se pudo cargar el historial');
        setCalls([]);
      });
  }, []);

  const callAgain = (call: Call, kind: 'audio' | 'video') => {
    void useCalls.getState().start(call.conversationId, kind, selfId);
  };

  return (
    <Workspace>
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.title}>Llamadas</span>
        </header>

        <div className={styles.list}>
          {calls === null ? (
            <SkeletonList rows={5} />
          ) : calls.length === 0 ? (
            <EmptyState
              icon={<Phone size={22} />}
              title="Sin llamadas todavía"
              description="Desde cualquier conversación puedes llamar, hacer videollamada o compartir pantalla."
            />
          ) : (
            calls.map((call) => {
              const outgoing = call.initiator.id === selfId;
              const missed = call.status === 'missed' || call.status === 'declined';
              const other =
                call.participants.find((participant) => participant.id !== selfId) ?? call.initiator;
              const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;

              return (
                <div key={call.id} className={styles.item}>
                  <Avatar user={other} size="md" presence />
                  <div
                    className={styles.body}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/mensajes/${call.conversationId}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') navigate(`/mensajes/${call.conversationId}`);
                    }}
                  >
                    <span className={styles.itemTitle}>{other.displayName}</span>
                    <span className={styles.itemBody}>
                      <Icon
                        size={12}
                        style={{
                          display: 'inline',
                          verticalAlign: '-1px',
                          color: missed ? 'var(--danger)' : undefined,
                        }}
                      />{' '}
                      {call.kind === 'video' ? 'Videollamada' : 'Llamada'}
                      {call.durationMs ? ` · ${duration(call.durationMs)}` : ''}
                      {missed ? ' · sin respuesta' : ''}
                    </span>
                  </div>

                  <span className={styles.stamp}>{relative(call.startedAt)}</span>
                  <IconButton label="Llamar" onClick={() => callAgain(call, 'audio')}>
                    <Phone size={16} />
                  </IconButton>
                  <IconButton label="Videollamada" onClick={() => callAgain(call, 'video')}>
                    <Video size={16} />
                  </IconButton>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Workspace>
  );
}
