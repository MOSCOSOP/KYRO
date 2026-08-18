import { create } from 'zustand';
import type {
  Community,
  CommunityDetail,
  CommunityEvent,
  CommunityMember,
  Conversation,
  MemberRole,
  RoomParticipant,
  VoiceRoom,
} from '@kyro/shared';
import { api } from '@/lib/api';
import { useChat } from './chat';

interface CommunitiesState {
  communities: Community[];
  loaded: boolean;
  loading: boolean;
  details: Record<string, CommunityDetail>;
  members: Record<string, CommunityMember[]>;
  activeId: string | null;

  load: () => Promise<void>;
  loadDetail: (id: string) => Promise<CommunityDetail>;
  loadMembers: (id: string) => Promise<CommunityMember[]>;
  setActive: (id: string | null) => void;

  create: (input: {
    name: string;
    description?: string;
    isPublic?: boolean;
  }) => Promise<Community>;
  join: (target: { communityId?: string; code?: string }) => Promise<Community>;
  leave: (id: string) => Promise<void>;
  update: (id: string, patch: Partial<Community>) => Promise<void>;
  setMuted: (id: string, muted: boolean) => Promise<void>;
  regenerateInvite: (id: string) => Promise<string>;
  invite: (id: string, userIds: string[]) => Promise<void>;
  setRole: (id: string, userId: string, role: Exclude<MemberRole, 'owner'>) => Promise<void>;
  kick: (id: string, userId: string) => Promise<void>;

  createChannel: (
    id: string,
    input: { name: string; kind?: 'text' | 'announcement'; topic?: string },
  ) => Promise<Conversation>;
  deleteChannel: (communityId: string, channelId: string) => Promise<void>;
  createRoom: (
    id: string,
    input: { name: string; kind?: 'voice' | 'meeting' | 'gaming'; topic?: string },
  ) => Promise<VoiceRoom>;
  deleteRoom: (communityId: string, roomId: string) => Promise<void>;

  createEvent: (
    id: string,
    input: {
      title: string;
      description?: string;
      startsAt: string;
      roomId?: string | null;
      channelId?: string | null;
    },
  ) => Promise<CommunityEvent>;
  toggleAttendance: (communityId: string, eventId: string) => Promise<void>;
  deleteEvent: (communityId: string, eventId: string) => Promise<void>;

  applyRoomState: (roomId: string, participants: RoomParticipant[]) => void;
  reset: () => void;
}

export const useCommunities = create<CommunitiesState>((set, get) => ({
  communities: [],
  loaded: false,
  loading: false,
  details: {},
  members: {},
  activeId: null,

  async load() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const data = await api.get<{ items: Community[] }>('/communities');
      set({ communities: data.items, loaded: true, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  async loadDetail(id) {
    const detail = await api.get<CommunityDetail>(`/communities/${id}`);
    set({ details: { ...get().details, [id]: detail } });

    // Los canales son conversaciones: se registran para que el chat funcione
    // exactamente igual que en un mensaje privado.
    for (const channel of detail.channels) useChat.getState().applyConversation(channel);

    const known = get().communities.some((community) => community.id === id);
    set({
      communities: known
        ? get().communities.map((community) => (community.id === id ? detail : community))
        : [...get().communities, detail],
    });
    return detail;
  },

  async loadMembers(id) {
    const data = await api.get<{ items: CommunityMember[] }>(`/communities/${id}/members`);
    set({ members: { ...get().members, [id]: data.items } });
    return data.items;
  },

  setActive(id) {
    set({ activeId: id });
  },

  async create(input) {
    const community = await api.post<Community>('/communities', input);
    set({ communities: [...get().communities, community] });
    return community;
  },

  async join(target) {
    const community = await api.post<Community>('/communities/join', target);
    const known = get().communities.some((item) => item.id === community.id);
    if (!known) set({ communities: [...get().communities, community] });
    await useChat.getState().loadConversations();
    return community;
  },

  async leave(id) {
    await api.post(`/communities/${id}/leave`);
    const { [id]: _detail, ...details } = get().details;
    set({
      communities: get().communities.filter((community) => community.id !== id),
      details,
      activeId: get().activeId === id ? null : get().activeId,
    });
  },

  async update(id, patch) {
    const community = await api.patch<Community>(`/communities/${id}`, patch);
    set({
      communities: get().communities.map((item) => (item.id === id ? { ...item, ...community } : item)),
      details: get().details[id]
        ? { ...get().details, [id]: { ...get().details[id], ...community } }
        : get().details,
    });
  },

  async setMuted(id, muted) {
    await api.patch(`/communities/${id}/settings`, { muted });
    set({
      communities: get().communities.map((item) => (item.id === id ? { ...item, muted } : item)),
    });
  },

  async regenerateInvite(id) {
    const data = await api.post<{ inviteCode: string }>(`/communities/${id}/invite-code`);
    set({
      communities: get().communities.map((item) =>
        item.id === id ? { ...item, inviteCode: data.inviteCode } : item,
      ),
    });
    return data.inviteCode;
  },

  async invite(id, userIds) {
    await api.post(`/communities/${id}/invites`, { userIds });
  },

  async setRole(id, userId, role) {
    const data = await api.patch<{ items: CommunityMember[] }>(
      `/communities/${id}/members/${userId}`,
      { role },
    );
    set({ members: { ...get().members, [id]: data.items } });
  },

  async kick(id, userId) {
    await api.delete(`/communities/${id}/members/${userId}`);
    set({
      members: {
        ...get().members,
        [id]: (get().members[id] ?? []).filter((member) => member.user.id !== userId),
      },
    });
  },

  async createChannel(id, input) {
    const channel = await api.post<Conversation>(`/communities/${id}/channels`, input);
    patchDetail(set, get, id, (detail) => ({ ...detail, channels: [...detail.channels, channel] }));
    useChat.getState().applyConversation(channel);
    return channel;
  },

  async deleteChannel(communityId, channelId) {
    await api.delete(`/communities/channels/${channelId}`);
    patchDetail(set, get, communityId, (detail) => ({
      ...detail,
      channels: detail.channels.filter((channel) => channel.id !== channelId),
    }));
    useChat.getState().removeConversation(channelId);
  },

  async createRoom(id, input) {
    const room = await api.post<VoiceRoom>(`/communities/${id}/rooms`, input);
    patchDetail(set, get, id, (detail) => ({ ...detail, rooms: [...detail.rooms, room] }));
    return room;
  },

  async deleteRoom(communityId, roomId) {
    await api.delete(`/communities/rooms/${roomId}`);
    patchDetail(set, get, communityId, (detail) => ({
      ...detail,
      rooms: detail.rooms.filter((room) => room.id !== roomId),
    }));
  },

  async createEvent(id, input) {
    const event = await api.post<CommunityEvent>(`/communities/${id}/events`, {
      ...input,
      endsAt: null,
    });
    patchDetail(set, get, id, (detail) => ({ ...detail, events: [...detail.events, event] }));
    return event;
  },

  async toggleAttendance(communityId, eventId) {
    const data = await api.post<{ attending: boolean; attendeeCount: number }>(
      `/communities/events/${eventId}/attendance`,
    );
    patchDetail(set, get, communityId, (detail) => ({
      ...detail,
      events: detail.events.map((event) =>
        event.id === eventId
          ? { ...event, attending: data.attending, attendeeCount: data.attendeeCount }
          : event,
      ),
    }));
  },

  async deleteEvent(communityId, eventId) {
    await api.delete(`/communities/events/${eventId}`);
    patchDetail(set, get, communityId, (detail) => ({
      ...detail,
      events: detail.events.filter((event) => event.id !== eventId),
    }));
  },

  applyRoomState(roomId, participants) {
    const details = { ...get().details };
    let changed = false;
    for (const [communityId, detail] of Object.entries(details)) {
      if (!detail.rooms.some((room) => room.id === roomId)) continue;
      details[communityId] = {
        ...detail,
        rooms: detail.rooms.map((room) => (room.id === roomId ? { ...room, participants } : room)),
      };
      changed = true;
    }
    if (changed) set({ details });
  },

  reset() {
    set({ communities: [], loaded: false, details: {}, members: {}, activeId: null });
  },
}));

type Setter = (partial: Partial<CommunitiesState>) => void;
type Getter = () => CommunitiesState;

function patchDetail(
  set: Setter,
  get: Getter,
  communityId: string,
  update: (detail: CommunityDetail) => CommunityDetail,
) {
  const detail = get().details[communityId];
  if (!detail) return;
  set({ details: { ...get().details, [communityId]: update(detail) } });
}
