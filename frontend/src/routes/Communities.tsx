import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { pageTitle } from '@/config/brand';
import { useChat } from '@/store/chat';
import { useCommunities } from '@/store/communities';
import { Workspace } from '@/components/layout/AppShell';
import { ChatView } from '@/components/chat/ChatView';
import { ChannelPanel } from '@/components/communities/ChannelPanel';
import { CommunityListPanel } from '@/components/communities/CommunityListPanel';
import { CommunityOverview } from '@/components/communities/CommunityOverview';
import { EmptyState, Loading } from '@/components/ui/Feedback';

export function Communities() {
  const { communityId, channelId } = useParams();
  const detail = useCommunities((state) => (communityId ? state.details[communityId] : undefined));
  const loaded = useCommunities((state) => state.loaded);
  const channel = useChat((state) => state.conversations.find((item) => item.id === channelId));

  useEffect(() => {
    if (!communityId) return;
    void useCommunities.getState().loadDetail(communityId).catch(() => undefined);
    useCommunities.getState().setActive(communityId);
    return () => useCommunities.getState().setActive(null);
  }, [communityId]);

  useEffect(() => {
    document.title = detail ? pageTitle(detail.name) : pageTitle('Comunidades');
  }, [detail]);

  if (!communityId) {
    return (
      <Workspace sidebar={<CommunityListPanel />} showContent={false}>
        {loaded ? (
          <EmptyState
            icon={<Users size={22} />}
            title="Tus comunidades"
            description="Elige una comunidad para ver sus canales, sus salas de voz y lo que se está cociendo."
          />
        ) : (
          <Loading />
        )}
      </Workspace>
    );
  }

  if (!detail) {
    return (
      <Workspace sidebar={<CommunityListPanel activeId={communityId} />} showContent>
        <Loading label="Abriendo comunidad" />
      </Workspace>
    );
  }

  return (
    <Workspace
      sidebar={<ChannelPanel community={detail} activeChannelId={channelId} />}
      showContent={Boolean(channelId)}
    >
      {channelId && channel ? (
        <ChatView conversation={channel} />
      ) : channelId ? (
        <Loading label="Abriendo canal" />
      ) : (
        <CommunityOverview community={detail} />
      )}
    </Workspace>
  );
}
