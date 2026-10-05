import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_DOCK_HEIGHT, tabDockBottom } from '@/components/app-tabs';
import { BoardProfileForm } from '@/components/board-profile';
import { Avatar, Body, Button, Card, Chips, Field, Glow, Heading, Label, PixelText, Podium, Row, ScreenHeader, Segmented } from '@/components/ui';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { levelOf, rankTitle } from '@/core/xp';
import { accountsEnabled, useSession } from '@/lib/auth';
import {
  avatarUrl,
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
  // Off the podium, your row stays in view above the tab bar.
  const [query, setQuery] = useState('');
  const [others, setOthers] = useState<Profile[]>([]);
  const searching = query.trim().length > 0;
  // Players off this board who match, to follow from the search.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const id = setTimeout(() => {
      findPlayers(query)
        .then(setOthers)
        .catch(() => setOthers([]));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);
  const [myRowBottom, setMyRowBottom] = useState<number>();
  const listTop = useRef(0);
  const [viewBottom, setViewBottom] = useState(0);
  // Hidden once your own row has scrolled into view above the pinned one.
  const pinned = mine && mine.rank > 3 && !(myRowBottom !== undefined && myRowBottom <= viewBottom - PINNED_ROOM) ? mine : undefined;

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
        contentContainerStyle={{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 110 + (pinned ? PINNED_ROOM : 0) }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => {
          const { contentOffset, layoutMeasurement } = e.nativeEvent;
          setViewBottom(contentOffset.y + layoutMeasurement.height - tabDockBottom(insets.bottom) - TAB_DOCK_HEIGHT);
        }}
        onLayout={(e) => {
          // Read the event now: the updater runs later, after React Native recycles it.
          const visible = e.nativeEvent.layout.height - tabDockBottom(insets.bottom) - TAB_DOCK_HEIGHT;
          setViewBottom((v) => v || visible);
        }}
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
              <Field
                value={query}
                onChangeText={setQuery}
                placeholder="Search players"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search players"
              />
              {error && <Body style={{ color: Palette.danger }}>{error}</Body>}
              {rows && searching ? (
                <SearchResults
                  query={query}
                  rows={rows}
                  others={query.trim().length >= 2 ? others : []}
                  board={board}
                  avatarFor={avatarFor}
                  onRival={toggleRival}
                  onFollow={async (p) => {
                    await setRival(p.user_id, true).catch(() => undefined);
                    await load();
                  }}
                />
              ) : !rows ? (
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
                    <View
                      style={{ gap: 6 }}
                      onLayout={(e) => {
                        // The column sits below the scroll view's top padding.
                        listTop.current = insets.top + Spacing.three + e.nativeEvent.layout.y;
                      }}>
                      {rows.slice(3).map((row) => (
                        <View
                          key={row.user_id}
                          onLayout={
                            row.is_me
                              ? (e) => setMyRowBottom(listTop.current + e.nativeEvent.layout.y + e.nativeEvent.layout.height)
                              : undefined
                          }>
                          <BoardLine row={row} board={board} avatar={avatarFor(row)} onRival={() => toggleRival(row)} />
                        </View>
                      ))}
                    </View>
                  )}
                  {rows.length <= 1 && (
                    <Body muted style={{ textAlign: 'center' }}>
                      {scope === 'rivals'
                        ? 'No rivals yet. Search for someone above, or tap ☆ on Everyone.'
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
              <Body muted style={{ fontSize: 13, textAlign: 'center' }}>
                Tap ☆ to make someone your rival; the Rivals board is you against them.
              </Body>
              <Body muted style={{ fontSize: 13, textAlign: 'center' }}>
                Every spam set earns XP. Each missed day costs 2%, except one free rest day a week.
              </Body>
            </>
          )}
        </View>
      </ScrollView>
      {pinned && (
        <View style={[styles.pinned, { bottom: tabDockBottom(insets.bottom) + TAB_DOCK_HEIGHT + 8 }]} pointerEvents="box-none">
          <BoardLine row={pinned} board={board} avatar={avatarFor(pinned)} onRival={() => undefined} />
        </View>
      )}
    </View>
  );
}

/** Room the pinned row takes, so the last rows can scroll clear of it. */
const PINNED_ROOM = 68;

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

/** The board filtered by name, then public players off this board that match, to follow. */
function SearchResults({
  query,
  rows,
  others,
  board,
  avatarFor,
  onRival,
  onFollow,
}: {
  query: string;
  rows: BoardRow[];
  others: Profile[];
  board: Board;
  avatarFor: (row: BoardRow) => string | undefined;
  onRival: (row: BoardRow) => void;
  onFollow: (p: Profile) => Promise<void>;
}) {
  const q = query.trim().toLowerCase();
  const matches = rows.filter((r) => r.display_name.toLowerCase().includes(q));
  const onBoard = new Set(rows.map((r) => r.user_id));
  const more = others.filter((p) => !onBoard.has(p.user_id));
  return (
    <View style={{ gap: 6 }}>
      {matches.map((row) => (
        <BoardLine key={row.user_id} row={row} board={board} avatar={avatarFor(row)} onRival={() => onRival(row)} />
      ))}
      {more.length > 0 && <Label style={{ marginTop: 8 }}>More players</Label>}
      {more.map((p) => (
        <View key={p.user_id} style={styles.line}>
          <Avatar uri={p.avatar_path ? avatarUrl(p.avatar_path) : undefined} size={40} />
          <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
            {p.display_name}
          </Text>
          <Button label="Follow" kind="tonal" onPress={() => onFollow(p)} />
        </View>
      ))}
      {!matches.length && !more.length && (
        <Body muted style={{ textAlign: 'center' }}>
          {q.length < 2 ? 'Keep typing to search everyone.' : `Nobody called “${query.trim()}”.`}
        </Body>
      )}
    </View>
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
  pinned: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    maxWidth: MaxContentWidth - Spacing.three * 2,
    boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
    borderRadius: Radius.card,
    // Solid under the row's translucent "you" tint, so rows scrolling behind don't show through.
    backgroundColor: Palette.panel,
  },
  position: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 14 },
  star: { width: 32, alignItems: 'center' },
});
