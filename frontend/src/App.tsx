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
  useAppearance(
    user?.preferences.reducedMotion ?? false,
    user?.preferences.theme ?? 'deep',
    user?.accentColor ?? null,
  );

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

/*
 * Variantes del acento personal. Se derivan del color elegido en lugar de
 * guardarse, para que una paleta nueva no obligue a tocar nada más.
 */
const ACCENT_VARS: [string, (color: string) => string][] = [
  ['--accent', (color) => color],
  ['--accent-hover', (color) => `color-mix(in srgb, ${color} 82%, #ffffff)`],
  ['--accent-active', (color) => `color-mix(in srgb, ${color} 88%, #000000)`],
  ['--accent-soft', (color) => `color-mix(in srgb, ${color} 14%, transparent)`],
  ['--accent-softer', (color) => `color-mix(in srgb, ${color} 7%, transparent)`],
  ['--accent-border', (color) => `color-mix(in srgb, ${color} 38%, transparent)`],
  ['--glow-accent', (color) => `0 0 24px color-mix(in srgb, ${color} 22%, transparent)`],
];

/** Movimiento, tema y color propio se aplican en la raíz, no por componente. */
function useAppearance(reduced: boolean, theme: string, accent: string | null) {
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
  }, [reduced]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // La barra del navegador acompaña al fondo elegido.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'soft' ? '#0F1218' : '#080A0E');
  }, [theme]);

  /*
   * El color del usuario sustituye al acento en toda la aplicación. La marca
   * (el degradado del logotipo, el acceso) no se toca: eso sigue siendo KYRO.
   */
  useEffect(() => {
    const root = document.documentElement.style;
    for (const [name, derive] of ACCENT_VARS) {
      if (accent) root.setProperty(name, derive(accent));
      else root.removeProperty(name);
    }
  }, [accent]);
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
