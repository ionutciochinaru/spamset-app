import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Card, Chips, Heading, Label, Row, Screen, Segmented, Title, Toggle, Well } from '@/components/ui';
import { accountsEnabled, deleteAccount, signInWithApple, signInWithGoogle, signOut, useSession } from '@/lib/auth';
import { scheduleSpamsets } from '@/lib/spamset-notify';
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
  const resetLocal = useApp((s) => s.resetLocal);
  const [status, setStatus] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
            {confirmDelete ? (
              <Well style={{ gap: 8 }}>
                <Heading>Delete your account?</Heading>
                <Body muted style={{ fontSize: 14 }}>
                  This permanently deletes your account, your synced spam sets, XP and leaderboard profile, and clears
                  this device. It can&apos;t be undone.
                </Body>
                <Row>
                  <Button
                    label={deleting ? 'Deleting…' : 'Delete forever'}
                    kind="danger"
                    disabled={deleting}
                    onPress={() => attempt(async () => {
                      setDeleting(true);
                      try {
                        await deleteAccount();
                        await scheduleSpamsets([], () => ({ title: '', body: '' })).catch(() => null);
                        resetLocal();
                      } finally {
                        setDeleting(false);
                      }
                    })}
                  />
                  <Button label="Cancel" kind="ghost" disabled={deleting} onPress={() => setConfirmDelete(false)} />
                </Row>
              </Well>
            ) : (
              <Button label="Delete account" kind="ghost" onPress={() => setConfirmDelete(true)} />
            )}
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
          Bodyweight and stretches are always available. Spam sets only pick exercises your equipment allows.
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
          <View>
            <Chips<string>
              wrap
              options={COMMON_BELLS.map((kg) => ({ value: String(kg), label: formatLoad(kg, settings.units) }))}
              selected={settings.bells.map(String)}
              onToggle={(kg) => toggleBell(Number(kg))}
            />
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
          <Toggle value={settings.haptics} onChange={(haptics) => update({ haptics })} label="Vibrate on countdowns" />
        </Row>
      </Card>
      <Button label="Animation review" kind="ghost" onPress={() => router.push('/debug/animations')} />
      <Button label="Visual library" kind="ghost" onPress={() => router.push('/debug/ui')} />
    </Screen>
  );
}
