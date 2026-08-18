import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import type { Conversation } from '@kyro/shared';
import { pageTitle } from '@/config/brand';
import { conversationName } from '@/lib/conversation';
import { useChat } from '@/store/chat';
import { useSession } from '@/store/session';
import { Workspace } from '@/components/layout/AppShell';
import { ChatView } from '@/components/chat/ChatView';
import { ConversationList } from '@/components/chat/ConversationList';
import { EmptyState, Loading } from '@/components/ui/Feedback';

export function Messages() {
  const { conversationId } = useParams();
  const selfId = useSession((state) => state.user?.id ?? '');
  const conversations = useChat((state) => state.conversations);
  const loaded = useChat((state) => state.conversationsLoaded);
  const [missing, setMissing] = useState(false);

  const conversation = conversations.find((item) => item.id === conversationId) ?? null;

  // Una conversación puede no estar en la lista (enlace directo, canal…).
  useEffect(() => {
    if (!conversationId || conversation) return;
    let cancelled = false;
    void useChat
      .getState()
      .ensureConversation(conversationId)
      .then((result) => {
        if (!cancelled && !result) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversation]);

  useEffect(() => {
    document.title = conversation
      ? pageTitle(conversationName(conversation, selfId))
      : pageTitle('Mensajes');
  }, [conversation, selfId]);

  return (
    <Workspace
      sidebar={<ConversationList activeId={conversationId} />}
      showContent={Boolean(conversationId)}
    >
      <Content conversationId={conversationId} conversation={conversation} missing={missing} loaded={loaded} />
    </Workspace>
  );
}

function Content({
  conversationId,
  conversation,
  missing,
  loaded,
}: {
  conversationId?: string;
  conversation: Conversation | null;
  missing: boolean;
  loaded: boolean;
}) {
  if (conversation) return <ChatView conversation={conversation} />;

  if (conversationId) {
    if (missing) {
      return (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title="Esta conversación ya no está"
          description="Puede que se haya eliminado o que ya no formes parte de ella."
        />
      );
    }
    return <Loading label="Abriendo conversación" />;
  }

  if (!loaded) return <Loading />;

  return (
    <EmptyState
      icon={<MessageCircle size={22} />}
      title="Elige una conversación"
      description="Selecciona un chat de la lista o empieza uno nuevo. Todo lo que hables aquí se queda contigo."
    />
  );
}
