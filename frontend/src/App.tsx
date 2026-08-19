import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { brand } from '@/config/brand';
import { useRealtime } from '@/hooks/useRealtime';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useChat } from '@/store/chat';
import { useCommunities } from '@/store/communities';
import { useNotifications } from '@/store/notifications';
import { useSession } from '@/store/session';
import { AppShell } from '@/components/layout/AppShell';
import { ConnectionBanner } from '@/components/layout/ConnectionBanner';
import { CallOverlay } from '@/components/calls/CallOverlay';
import { VoiceBar } from '@/components/calls/VoiceBar';
import { CommandPalette } from '@/components/search/CommandPalette';
import { ProfilePanel } from '@/components/profile/ProfilePanel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Loading } from '@/components/ui/Feedback';
import { Toaster } from '@/components/ui/Toaster';
import { Login } from '@/routes/auth/Login';
import { Register } from '@/routes/auth/Register';
import { Onboarding } from '@/routes/auth/Onboarding';
import { Home } from '@/routes/Home';
import { Messages } from '@/routes/Messages';
import { Communities } from '@/routes/Communities';
import { Activity } from '@/routes/Activity';
import { Calls } from '@/routes/Calls';
import { SettingsPage } from '@/routes/Settings';
import { Profile } from '@/routes/Profile';

export function App() {
  const status = useSession((state) => state.status);
  const user = useSession((state) => state.user);

  useEffect(() => {
    void useSession.getState().bootstrap();
  }, []);

  useRealtime();
  useShortcuts();
  useInitialData(Boolean(user));
  useMotionPreference(user?.preferences.reducedMotion ?? false);

  if (status === 'loading') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
        <Loading label={`Cargando ${brand.name}`} />
      </div>
    );
  }

  if (status === 'anonymous' || !user) {
    return (
      <Routes>
        <Route path="/entrar" element={<Login />} />
        <Route path="/crear-cuenta" element={<Register />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );
  }

  if (!user.onboardedAt) return <Onboarding />;

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mensajes" element={<Messages />} />
          <Route path="/mensajes/:conversationId" element={<Messages />} />
          <Route path="/comunidades" element={<Communities />} />
          <Route path="/comunidades/:communityId" element={<Communities />} />
          <Route path="/comunidades/:communityId/:channelId" element={<Communities />} />
          <Route path="/actividad" element={<Activity />} />
          <Route path="/llamadas" element={<Calls />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <ConnectionBanner />
      <VoiceBar />
      <CallOverlay />
      <CommandPalette />
      <ProfilePanel />
      <ConfirmDialog />
      <Toaster />
    </>
  );
}

/** La preferencia de movimiento del usuario se aplica a toda la interfaz. */
function useMotionPreference(reduced: boolean) {
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
  }, [reduced]);
}

/** Datos que la aplicación necesita nada más entrar. */
function useInitialData(authenticated: boolean) {
  useEffect(() => {
    if (!authenticated) return;
    void useChat.getState().loadConversations().catch(() => undefined);
    void useCommunities.getState().load().catch(() => undefined);
    void useNotifications.getState().refreshCount().catch(() => undefined);
  }, [authenticated]);
}
