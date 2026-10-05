import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Body, Button, Card, Chips, Field, Glow, Heading, Label, Meter, PixelText, Row, ScreenHeader, Segmented, Stat, Toggle } from '@/components/ui';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { xpState } from '@/core/xp';
import { accountsEnabled, useSession } from '@/lib/auth';
import {
  avatarUrls,
  findPlayers,
  leaderboard,
  myProfile,
  saveProfile,
  setRival,
  type Board,
  type BoardRow,
  type Profile,
  type Scope,
} from '@/lib/leaderboard';
import { syncAvatar } from '@/lib/avatar';
import { syncNow } from '@/lib/sync';
import { useApp } from '@/store/app-store';

const BOARDS: { value: Board; label: string }[] = [
  { value: 'all', label: 'All-time' },
  { value: 'week', label: 'This week' },
  { value: 'streak', label: 'Streak' },
];

export default function Ranks() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const sessions = useApp((s) => s.sessions);
  const me = useMemo(() => xpState(sessions), [sessions]);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [board, setBoard] = useState<Board>('all');
  const [scope, setScope] = useState<Scope>('everyone');
  const [rows, setRows] = useState<BoardRow[]>();
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setError(undefined);
      await syncAvatar().catch(() => null);
      const p = await myProfile();
      setProfile(p);
      if (p) {
        const next = await leaderboard(board, scope);
        setRows(next);
        setAvatars(await avatarUrls(next.map((r) => r.user_id)).catch(() => ({})));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the leaderboard.');
    }
  }, [session, board, scope]);

  // Load after the current render: sync first, then the board (and again when it changes).
  useEffect(() => {
    if (session)
      syncNow()
        .catch(() => null)
        .then(load);
  }, [session, load]);

  const refresh = async () => {
    setRefreshing(true);
    await syncNow().catch(() => null);
    await load();
    setRefreshing(false);
  };

  const toggleRival = async (row: BoardRow) => {
    try {
      await setRival(row.user_id, !row.is_rival);
      setRows((rs) => rs?.map((r) => (r.user_id === row.user_id ? { ...r, is_rival: !r.is_rival } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update rivals.');
    }
  };

  return (
    <View style={styles.screen}>
      <Glow />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          session && profile ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Palette.accent} /> : undefined
        }>
        <View style={styles.column}>
          <ScreenHeader title="Ranks" />

          {/* Your level, from this device's spam sets. */}
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Label>Level</Label>
              <PixelText size={PixelSize.small} color={Palette.muted}>
                {me.levelXp}/{me.levelSize} XP
              </PixelText>
            </Row>
            <Row style={{ alignItems: 'center' }}>
              <View style={styles.levelBadge}>
                <PixelText size={PixelSize.large} color="#000" style={{ textShadowColor: 'transparent' }}>
                  {me.level}
                </PixelText>
              </View>
              <View style={{ flex: 1 }}>
                <Meter value={Math.round((me.levelXp / me.levelSize) * 10)} max={10} color={Psx.hud} />
              </View>
            </Row>
            <Row>
              <Stat value={String(me.total)} label="XP" icon={{ ios: 'star.fill', md: 'star' }} />
              <Stat value={String(me.week)} label="This week" icon={{ ios: 'calendar', md: 'calendar_today' }} />
              <Stat value={String(me.streak)} label="Day streak" icon={{ ios: 'flame.fill', md: 'local_fire_department' }} />
            </Row>
            <Body muted style={{ fontSize: 13 }}>
              Every spam set earns XP. Each missed day costs 2%, except one free rest day a week.
            </Body>
          </Card>

          {!accountsEnabled ? (
            <Body muted>This build runs offline only, so there are no leaderboards.</Body>
          ) : !session ? (
            <Card>
              <Heading>Compete with others</Heading>
              <Body muted>Sign in to put your XP on the boards and follow rivals.</Body>
              <Button label="Sign in" onPress={() => router.push('/profile')} />
            </Card>
          ) : profile === undefined ? (
            <ActivityIndicator color={Palette.accent} style={{ marginTop: 24 }} />
          ) : !profile ? (
            <ProfileForm onSaved={(p) => setProfile(p)} />
          ) : (
            <>
              <Segmented<Board> options={BOARDS} value={board} onChange={setBoard} />
              <Chips<Scope>
                options={[
                  { value: 'everyone', label: 'Everyone' },
                  { value: 'rivals', label: 'Rivals' },
                ]}
                selected={scope}
                onToggle={setScope}
              />
              {error && <Body style={{ color: Palette.danger }}>{error}</Body>}
              {!rows ? (
                <ActivityIndicator color={Palette.accent} style={{ marginTop: 24 }} />
              ) : (
                <Card style={{ paddingVertical: 6, gap: 0 }}>
                  {rows.map((row) => (
                    <BoardLine key={row.user_id} row={row} board={board} avatar={avatars[row.user_id]} onRival={() => toggleRival(row)} />
                  ))}
                  {scope === 'rivals' && rows.length <= 1 && (
                    <Body muted style={{ paddingVertical: 12 }}>
                      No rivals yet. Tap ☆ next to anyone on Everyone, or find them by name below.
                    </Body>
                  )}
                </Card>
              )}
              {!profile.is_public && (
                <Body muted style={{ fontSize: 13 }}>
                  Your profile is private: only you see yourself on the boards.
                </Body>
              )}
              <FindRivals onAdded={load} />
              <ProfileForm
                profile={profile}
                onSaved={(p) => {
                  setProfile(p);
                  // A new profile can carry your picture now; reload to show it.
                  load();
                }}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function BoardLine({ row, board, avatar, onRival }: { row: BoardRow; board: Board; avatar?: string; onRival: () => void }) {
  const unit = board === 'streak' ? (row.value === 1 ? 'day' : 'days') : 'XP';
  return (
    <View style={[styles.line, row.is_me && styles.lineMe]}>
      <PixelText size={PixelSize.small} color={row.rank <= 3 ? Psx.hud : Palette.muted} style={{ width: 36 }}>
        {row.rank}
      </PixelText>
      <Avatar uri={avatar} size={32} />
      <Text style={[styles.name, row.is_me && { color: Palette.accent }]} numberOfLines={1}>
        {row.display_name}
        {row.is_me ? ' (you)' : ''}
      </Text>
      <PixelText size={PixelSize.small} color={Psx.hud}>
        {row.value}
      </PixelText>
      <Text style={styles.unit}>{unit}</Text>
      {row.is_me ? (
        <View style={styles.star} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.is_rival ? `Stop following ${row.display_name}` : `Follow ${row.display_name} as a rival`}
          hitSlop={8}
          onPress={onRival}
          style={styles.star}>
          <Text style={{ color: row.is_rival ? Psx.hud : Palette.dim, fontSize: 20 }}>{row.is_rival ? '★' : '☆'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function FindRivals({ onAdded }: { onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  useEffect(() => {
    const id = setTimeout(() => {
      findPlayers(query)
        .then(setFound)
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);
  return (
    <Card>
      <Label>Find a rival</Label>
      <Field value={query} onChangeText={setQuery} placeholder="Search by name" autoCapitalize="none" autoCorrect={false} />
      {found.map((p) => (
        <Row key={p.user_id} style={{ justifyContent: 'space-between' }}>
          <Body style={{ flex: 1 }}>{p.display_name}</Body>
          <Button
            label="Follow"
            kind="tonal"
            onPress={() =>
              setRival(p.user_id, true)
                .catch(() => undefined)
                .then(() => {
                  setQuery('');
                  onAdded();
                })
            }
          />
        </Row>
      ))}
    </Card>
  );
}

function ProfileForm({ profile, onSaved }: { profile?: Profile; onSaved: (p: Profile) => void }) {
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
      <Label>{profile ? 'Your board profile' : 'Join the boards'}</Label>
      {!profile && <Body muted>Pick a name for the leaderboards. You can change it later.</Body>}
      <Field value={name} onChangeText={setName} placeholder="Display name" maxLength={24} autoCorrect={false} />
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body>Public</Body>
          <Body muted style={{ fontSize: 13 }}>
            Others see your name, XP and streak, and can follow you.
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  levelBadge: {
    minWidth: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 20px rgba(255,107,43,0.35)',
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 4, borderRadius: Radius.button },
  lineMe: { backgroundColor: 'rgba(255,107,43,0.1)' },
  name: { flex: 1, color: Palette.text, fontFamily: DisplayFont.semibold, fontSize: 16 },
  unit: { color: Palette.muted, fontSize: 12, width: 30 },
  star: { width: 32, alignItems: 'center' },
});
