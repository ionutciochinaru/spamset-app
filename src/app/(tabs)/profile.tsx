import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Body, Button, Card, Chips, Heading, Label, Row, Screen, Segmented, Title } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { accountsEnabled, signInWithApple, signInWithGoogle, signOut, useSession } from '@/lib/auth';
import { syncNow } from '@/lib/sync';
import { EQUIPMENT_LABELS, OWNABLE_EQUIPMENT, type Equipment } from '@/core/exercises';
import { formatLoad, ownedEquipment, useApp, type Units } from '@/store/app-store';

const COMMON_BELLS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48];

export default function Profile() {
  const session = useSession();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const setAuthMode = useApp((s) => s.setAuthMode);
  const lastSyncedAt = useApp((s) => s.lastSyncedAt);
  const [status, setStatus] = useState<string>();

  const toggleBell = (kg: number) => {
    const bells = settings.bells.includes(kg) ? settings.bells.filter((b) => b !== kg) : [...settings.bells, kg];
    if (bells.length) update({ bells: bells.sort((a, b) => a - b) });
  };

  const owned = ownedEquipment(settings);
  const toggleEquipment = (item: Equipment) =>
    update({ equipment: owned.includes(item) ? owned.filter((e) => e !== item) : [...owned, item] });

  const attempt = async (action: () => Promise<unknown>) => {
    setStatus(undefined);
    try {
      await action();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Title>Profile</Title>

      <Card>
        <Label>Account</Label>
        {session ? (
          <>
            <Heading>{session.user.email ?? 'Signed in'}</Heading>
            <Body muted style={{ fontSize: 14 }}>
              {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Not synced yet'}
            </Body>
            <Row>
              <Button
                label="Sync now"
                kind="tonal"
                onPress={() => attempt(async () => {
                  const r = await syncNow();
                  if (r) setStatus(`Uploaded ${r.pushed}, ${r.pulled} sessions in your account.`);
                })}
              />
              <Button label="Sign out" kind="ghost" onPress={() => attempt(async () => {
                await signOut();
                setAuthMode('offline');
              })} />
            </Row>
          </>
        ) : (
          <>
            <Heading>Offline</Heading>
            <Body muted style={{ fontSize: 14 }}>
              {accountsEnabled
                ? 'Your data is only on this device. Sign in to back it up and use it on other devices.'
                : 'Accounts are not configured in this build.'}
            </Body>
            {accountsEnabled && (
              <View style={{ gap: 8 }}>
                <Button label="Continue with Apple" kind="tonal" onPress={() => attempt(signInWithApple)} />
                <Button label="Continue with Google" kind="tonal" onPress={() => attempt(signInWithGoogle)} />
              </View>
            )}
          </>
        )}
        {status && <Body muted style={{ fontSize: 14 }}>{status}</Body>}
      </Card>

      <Card>
        <Label>Your equipment</Label>
        <Body muted style={{ fontSize: 14 }}>
          Bodyweight and stretches are always available. Exercises and workouts that need anything else only show when you have it.
        </Body>
        <Chips
          wrap
          options={OWNABLE_EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))}
          selected={owned}
          onToggle={toggleEquipment}
        />
      </Card>

      {owned.includes('kettlebell') && (
        <Card>
          <Label>Your kettlebells</Label>
          <Body muted style={{ fontSize: 14 }}>
            Select every bell you own. Progression only suggests these.
          </Body>
          <View style={styles.bells}>
            {COMMON_BELLS.map((kg) => {
              const has = settings.bells.includes(kg);
              return (
                <Pressable key={kg} onPress={() => toggleBell(kg)} style={[styles.bell, has && styles.owned]}>
                  <Text style={[styles.bellText, has && styles.ownedText]}>{formatLoad(kg, settings.units)}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <Card>
        <Label>Units</Label>
        <Segmented<Units>
          options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]}
          value={settings.units}
          onChange={(units) => update({ units })}
        />
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <Body>Vibrate on countdowns</Body>
          <Switch
            value={settings.haptics}
            onValueChange={(haptics) => update({ haptics })}
            trackColor={{ true: Palette.accent, false: Palette.track }}
          />
        </Row>
      </Card>
      <Button label="Animation review" kind="ghost" onPress={() => router.push('/debug/animations')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bells: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bell: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.pill, backgroundColor: Palette.tonal, minWidth: 64, alignItems: 'center' },
  owned: { backgroundColor: Palette.accent },
  bellText: { color: Palette.muted, fontWeight: '700' },
  ownedText: { color: Palette.bg },
});
