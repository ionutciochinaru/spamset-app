/** Your leaderboard name and visibility: joining on Ranks, editing on Profile. */
import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Card, Field, Label, Row, Toggle } from '@/components/ui';
import { Palette } from '@/constants/theme';
import { saveProfile, type Profile } from '@/lib/leaderboard';

export function BoardProfileForm({ profile, onSaved }: { profile?: Profile | null; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile?.display_name ?? '');
  const [isPublic, setPublic] = useState(profile?.is_public ?? true);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      onSaved(await saveProfile({ display_name: name, is_public: isPublic }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
    setSaving(false);
  };
  const changed = !profile || profile.display_name !== name.trim() || profile.is_public !== isPublic;
  return (
    <Card>
      <Label>{profile ? 'Leaderboard profile' : 'Join the boards'}</Label>
      {!profile && <Body muted>Pick a name for the leaderboards. You can change it later in Profile.</Body>}
      <Field value={name} onChangeText={setName} placeholder="Display name" maxLength={24} autoCorrect={false} />
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body>Public</Body>
          <Body muted style={{ fontSize: 13 }}>
            Others see your name, picture, XP and streak, and can follow you.
          </Body>
        </View>
        <Toggle value={isPublic} onChange={setPublic} label="Public profile" />
      </Row>
      {error && <Body style={{ color: Palette.danger }}>{error}</Body>}
      {changed && (
        <Button label={saving ? 'Saving…' : profile ? 'Save' : 'Join'} disabled={saving || name.trim().length < 2} onPress={save} />
      )}
    </Card>
  );
}
