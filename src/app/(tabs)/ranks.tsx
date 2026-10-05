import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoardProfileForm } from '@/components/board-profile';
import { Avatar, Body, Button, Card, Chips, Field, Glow, Heading, Label, PixelText, Podium, Row, ScreenHeader, Segmented } from '@/components/ui';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { levelOf, rankTitle } from '@/core/xp';
import { accountsEnabled, useSession } from '@/lib/auth';
import {
  avatarUrls,
  findPlayers,
  leaderboard,
  myProfile,
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

  const localAvatar = useApp((s) => s.avatarUri);
  // Your own row shows this phone's picture until the upload lands.
  const avatarFor = (row: BoardRow) => avatars[row.user_id] ?? (row.is_me ? localAvatar : undefined);
  const mine = rows?.find((r) => r.is_me);

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
            <BoardProfileForm onSaved={(p) => { setProfile(p); load(); }} />
          ) : (
            <>
              {/* One control row: which board, and everyone or just your rivals. */}
              <Segmented<Board> options={BOARDS} value={board} onChange={setBoard} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Chips<Scope>
                  options={[
                    { value: 'everyone', label: 'Everyone' },
                    { value: 'rivals', label: 'Rivals' },
                  ]}
                  selected={scope}
                  onToggle={setScope}
                />
                {mine && (
                  <Text style={styles.position}>
                    You&apos;re <Text style={{ color: Psx.hud }}>#{mine.rank}</Text> of {rows?.length}
                  </Text>
                )}
              </Row>
              {error && <Body style={{ color: Palette.danger }}>{error}</Body>}
              {!rows ? (
                <ActivityIndicator color={Palette.accent} style={{ marginTop: 24 }} />
              ) : (
                <>
                  <Podium
                    entries={rows.slice(0, 3).map((r) => ({
                      key: r.user_id,
                      name: r.is_me ? `${r.display_name} (you)` : r.display_name,
                      subtitle: rankTitle(levelOf(r.total).level),
                      value: valueText(r, board),
                      avatar: avatarFor(r),
                      me: r.is_me,
                    }))}
                  />
                  {rows.length > 3 && (
                    <View style={{ gap: 6 }}>
                      {rows.slice(3).map((row) => (
                        <BoardLine key={row.user_id} row={row} board={board} avatar={avatarFor(row)} onRival={() => toggleRival(row)} />
                      ))}
                    </View>
                  )}
                  {rows.length <= 1 && (
                    <Body muted style={{ textAlign: 'center' }}>
                      {scope === 'rivals'
                        ? 'No rivals yet. Find someone by name below and follow them.'
                        : 'Only you so far. Get a friend on Spamset and race them.'}
                    </Body>
                  )}
                </>
              )}
              {!profile.is_public && (
                <Body muted style={{ fontSize: 13, textAlign: 'center' }}>
                  Your profile is private: only you see yourself on the boards. Change it in Profile.
                </Body>
              )}
              {scope === 'rivals' && <FindRivals onAdded={load} />}
              <Body muted style={{ fontSize: 13, textAlign: 'center' }}>
                Every spam set earns XP. Each missed day costs 2%, except one free rest day a week.
              </Body>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** "1 240 XP" or "6 days". */
function valueText(row: BoardRow, board: Board): string {
  return board === 'streak' ? `${row.value} ${row.value === 1 ? 'day' : 'days'}` : `${row.value} XP`;
}

function BoardLine({ row, board, avatar, onRival }: { row: BoardRow; board: Board; avatar?: string; onRival: () => void }) {
  return (
    <View style={[styles.line, row.is_me && styles.lineMe]}>
      <PixelText size={PixelSize.small} color={Palette.muted} style={{ width: 28 }}>
        {row.rank}
      </PixelText>
      <Avatar uri={avatar} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.name, row.is_me && { color: Palette.accent }]} numberOfLines={1}>
          {row.display_name}
          {row.is_me ? ' (you)' : ''}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          LV {levelOf(row.total).level} · {rankTitle(levelOf(row.total).level)}
        </Text>
      </View>
      <PixelText size={PixelSize.small} color={Psx.hud}>
        {valueText(row, board)}
      </PixelText>
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


const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    paddingHorizontal: 12,
    borderRadius: Radius.card,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Psx.edge,
  },
  lineMe: { backgroundColor: 'rgba(255,107,43,0.12)', borderColor: 'rgba(255,107,43,0.4)' },
  name: { color: Palette.text, fontFamily: DisplayFont.semibold, fontSize: 16 },
  title: { color: Palette.muted, fontSize: 12 },
  position: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 14 },
  star: { width: 32, alignItems: 'center' },
});
