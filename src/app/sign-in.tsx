import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Screen, Title } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { accountsEnabled, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { useApp } from '@/store/app-store';

export default function SignIn() {
  const setAuthMode = useApp((s) => s.setAuthMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (signIn: () => Promise<boolean>) => {
    setBusy(true);
    setError(undefined);
    try {
      if (await signIn()) setAuthMode('account');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <FigureViewer clipId="kb-swing" controls={false} style={styles.viewer} />
      </View>
      <Title>Spamset</Title>
      <Body muted>
        Circuits, EMOMs, ladders and strength sets for your kettlebells. It tracks every set and tells you when to move up
        a bell. Drag the figure to check the form from any angle.
      </Body>

      <View style={styles.actions}>
        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={Radius.card}
            style={[styles.apple, !accountsEnabled && { opacity: 0.4 }]}
            onPress={() => accountsEnabled && !busy && run(signInWithApple)}
          />
        ) : (
          <Button label="Continue with Apple" kind="tonal" large disabled={!accountsEnabled || busy} onPress={() => run(signInWithApple)} />
        )}
        <Button label="Continue with Google" kind="tonal" large disabled={!accountsEnabled || busy} onPress={() => run(signInWithGoogle)} />
        <Button label="Continue offline" kind="primary" large disabled={busy} onPress={() => setAuthMode('offline')} />
      </View>

      {error && <Body style={{ color: Palette.danger }}>{error}</Body>}
      <Body muted style={styles.note}>
        {accountsEnabled
          ? 'Offline keeps everything on this device. Sign in later from Profile to back up and sync.'
          : 'Accounts are not configured in this build, so data stays on this device.'}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center' },
  viewer: { width: '100%', maxWidth: 420, aspectRatio: 1 },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  apple: { height: 58, width: '100%' },
  note: { fontSize: 13, textAlign: 'center' },
});
