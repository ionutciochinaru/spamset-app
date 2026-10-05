import { PressStart2P_400Regular, useFonts } from '@expo-google-fonts/press-start-2p';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Palette } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useSpamsetScheduler } from '@/lib/spamset-scheduler';
import { syncNow } from '@/lib/sync';
import { useApp } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Palette.bg, card: Palette.bg, primary: Palette.accent, text: Palette.text },
};

/** Lives inside the signed-in stack so notification taps can navigate. */
function SpamsetScheduler() {
  useSpamsetScheduler();
  return null;
}

export default function RootLayout() {
  const authMode = useApp((s) => s.authMode);
  const setAuthMode = useApp((s) => s.setAuthMode);
  const session = useSession();

  const [fontsLoaded, fontError] = useFonts({ PressStart2P_400Regular, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Returning from web OAuth, or a restored session, means account mode. Sync once signed in.
  useEffect(() => {
    if (!session) return;
    if (authMode !== 'account') setAuthMode('account');
    syncNow().catch((e) => console.warn('Sync failed', e));
  }, [session, authMode, setAuthMode]);

  // Keep the splash up until the fonts are ready, so screens never flash in fallback type.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Palette.bg } }}>
        <Stack.Protected guard={authMode !== undefined}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="exercise/[id]" />
          <Stack.Screen name="debug/ui" />
          <Stack.Screen name="debug/animations" />
          <Stack.Screen name="spamset" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="profile" />
          <Stack.Screen name="spamset-settings" />
        </Stack.Protected>
        <Stack.Protected guard={authMode === undefined}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
      {authMode !== undefined && <SpamsetScheduler />}
    </ThemeProvider>
  );
}
