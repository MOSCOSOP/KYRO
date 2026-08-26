import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  CalendarPlus,
  Gamepad2,
  Hash,
  LogOut,
  Megaphone,
  Mic,
  MicOff,
  Plus,
  Settings,
  UserPlus,
  Video,
  Volume2,
} from 'lucide-react';
import type { CommunityDetail, RoomKind } from '@kyro/shared';
import { can } from '@kyro/shared';
import { useChat } from '@/store/chat';
import { useCommunities } from '@/store/communities';
import { useSession } from '@/store/session';
import { useVoice } from '@/store/voice';
import { toastError, useUI } from '@/store/ui';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { Menu, MenuItem, MenuSeparator, useMenu } from '@/components/ui/Menu';
import { CreateChannelModal } from './CreateChannelModal';
import { CreateEventModal } from './CreateEventModal';
import { InviteModal } from './InviteModal';
import { CommunitySettingsModal } from './CommunitySettingsModal';
import styles from './Communities.module.css';

const ROOM_ICON: Record<RoomKind, typeof Volume2> = {
  voice: Volume2,
  meeting: Video,
  gaming: Gamepad2,
};

export function ChannelPanel({
  community,
  activeChannelId,
}: {
  community: CommunityDetail;
  activeChannelId?: string;
}) {
  const selfId = useSession((state) => state.user?.id ?? '');
  const conversations = useChat((state) => state.conversations);
  const activeRoomId = useVoice((state) => state.roomId);
  const leaveCommunity = useCommunities((state) => state.leave);
  const confirm = useUI((state) => state.confirm);
  const navigate = useNavigate();
  const menu = useMenu();
  const menuButton = useRef<HTMLButtonElement>(null);

  const [channelOpen, setChannelOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const role = community.myRole ?? 'member';
  const canManage = can(role, 'channel.create');
  const canCreateEvent = can(role, 'event.create');
  const canInvite = can(role, 'member.invite');

  const leave = async () => {
    const ok = await confirm({
      title: `¿Salir de ${community.name}?`,
      description: 'Dejarás de ver sus canales y mensajes.',
      confirmLabel: 'Salir',
      danger: true,
    });
    if (!ok) return;
    try {
      await leaveCommunity(community.id);
      navigate('/comunidades');
    } catch (err) {
      toastError(err, 'No se pudo salir de la comunidad');
    }
  };

  const joinRoom = (roomId: string, roomName: string) => {
    if (activeRoomId === roomId) {
      useVoice.getState().leave();
      return;
    }
    void useVoice.getState().join({ roomId, roomName, communityId: community.id, selfId });
  };

  /*
   * Cada comunidad puede tener su color. Se inyecta como variable local, de
   * modo que el canal activo y los detalles del panel se tiñen con él sin que
   * ningún componente tenga que saber de dónde sale.
   */
  const accent = community.accentColor;

  return (
    <div
      className={styles.panel}
      style={accent ? ({ '--community-accent': accent } as React.CSSProperties) : undefined}
    >
      <header className={styles.header}>
        <Link to="/comunidades" aria-label="Todas las comunidades">
          <IconButton label="Todas las comunidades" size="sm">
            <ArrowLeft size={16} />
          </IconButton>
        </Link>
        <span className={styles.headerText}>
          <span className={styles.title}>{community.name}</span>
          <span className={styles.subtitle}>
            {community.memberCount} miembros
            {community.onlineCount > 0 ? ` · ${community.onlineCount} en línea` : ''}
          </span>
        </span>
        <IconButton
          ref={menuButton}
          label="Opciones de la comunidad"
          onClick={() => menu.openFrom(menuButton.current)}
        >
          <Settings size={17} />
        </IconButton>
      </header>

      <div className={styles.scroll}>
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span className={styles.groupTitle}>Canales</span>
            {canManage ? (
              <IconButton label="Nuevo canal o sala" size="sm" onClick={() => setChannelOpen(true)}>
                <Plus size={14} />
              </IconButton>
            ) : null}
          </div>

          {community.channels.map((channel) => {
            const live = conversations.find((item) => item.id === channel.id) ?? channel;
            const Icon = channel.channelKind === 'announcement' ? Megaphone : Hash;
            return (
              <Link
                key={channel.id}
                to={`/comunidades/${community.id}/${channel.id}`}
                className={clsx(styles.item, channel.id === activeChannelId && styles.itemActive)}
              >
                <Icon size={16} className={styles.itemIcon} />
                <span className={styles.itemName}>{channel.name}</span>
                <Badge count={live.unreadCount} muted={live.muted} />
              </Link>
            );
          })}
        </div>

        {community.rooms.length > 0 ? (
          <div className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.groupTitle}>Voz y encuentros</span>
            </div>

            {community.rooms.map((room) => {
              const Icon = ROOM_ICON[room.kind] ?? Volume2;
              const active = activeRoomId === room.id;
              return (
                <div key={room.id}>
                  <button
                    type="button"
                    className={clsx(styles.item, active && styles.itemActive)}
                    onClick={() => joinRoom(room.id, room.name)}
                  >
                    <Icon size={16} className={styles.itemIcon} />
                    <span className={styles.itemName}>{room.name}</span>
                    {room.participants.length > 0 ? (
                      <span className={styles.communityMeta}>{room.participants.length}</span>
                    ) : null}
                  </button>

                  {room.participants.length > 0 ? (
                    <div className={styles.roomParticipants}>
                      {room.participants.map((participant) => (
                        <span
                          key={participant.user.id}
                          className={clsx(
                            styles.participant,
                            participant.muted && styles.participantMuted,
                          )}
                        >
                          <Avatar user={participant.user} size="xs" />
                          {participant.user.displayName}
                          {participant.muted ? <MicOff size={11} /> : <Mic size={11} />}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span className={styles.groupTitle}>Encuentros</span>
            {canCreateEvent ? (
              <IconButton label="Nuevo evento" size="sm" onClick={() => setEventOpen(true)}>
                <CalendarPlus size={14} />
              </IconButton>
            ) : null}
          </div>
          <Link to={`/comunidades/${community.id}`} className={styles.item}>
            <CalendarPlus size={16} className={styles.itemIcon} />
            <span className={styles.itemName}>
              {community.events.length === 0
                ? 'Sin encuentros'
                : community.events.length === 1
                  ? '1 programado'
                  : `${community.events.length} programados`}
            </span>
          </Link>
        </div>
      </div>

      {menu.anchor ? (
        <Menu anchor={menu.anchor} open={menu.open} onClose={menu.close} label="Opciones de la comunidad">
          {canInvite ? (
            <MenuItem
              icon={<UserPlus size={16} />}
              onSelect={() => {
                setInviteOpen(true);
                menu.close();
              }}
            >
              Invitar personas
            </MenuItem>
          ) : null}
          {canManage ? (
            <MenuItem
              icon={<Settings size={16} />}
              onSelect={() => {
                setSettingsOpen(true);
                menu.close();
              }}
            >
              Ajustes de la comunidad
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <MenuItem
            icon={<LogOut size={16} />}
            danger
            onSelect={() => {
              void leave();
              menu.close();
            }}
          >
            Salir de la comunidad
          </MenuItem>
        </Menu>
      ) : null}

      <CreateChannelModal
        communityId={community.id}
        open={channelOpen}
        onClose={() => setChannelOpen(false)}
      />
      <CreateEventModal community={community} open={eventOpen} onClose={() => setEventOpen(false)} />
      <InviteModal community={community} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <CommunitySettingsModal
        community={community}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
