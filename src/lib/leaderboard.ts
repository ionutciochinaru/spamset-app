/**
 * Leaderboards on Supabase: your public profile, boards and rivals. XP itself is computed
 * by the server from synced spam sets (supabase/migrations/0002_leaderboard.sql); boards
 * only show players who made their profile public.
 */
import { supabase } from './supabase';

export type Board = 'all' | 'week' | 'streak';
export type Scope = 'everyone' | 'rivals';

export type Profile = { user_id: string; display_name: string; is_public: boolean; tz: string; avatar_path?: string | null };

export type BoardRow = {
  rank: number;
  user_id: string;
  display_name: string;
  value: number;
  total: number;
  week: number;
  streak: number;
  is_me: boolean;
  is_rival: boolean;
};

function client() {
  if (!supabase) throw new Error('Accounts are not configured in this build.');
  return supabase;
}

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function myProfile(): Promise<Profile | null> {
  const db = client();
  const { data: auth } = await db.auth.getSession();
  const id = auth.session?.user.id;
  if (!id) return null;
  const { data, error } = await db.from('profiles').select('user_id, display_name, is_public, tz, avatar_path').eq('user_id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Create or update your profile. Your device's time zone decides where your days start. */
export async function saveProfile(input: { display_name: string; is_public: boolean }): Promise<Profile> {
  const db = client();
  const { data: auth } = await db.auth.getSession();
  const id = auth.session?.user.id;
  if (!id) throw new Error('Sign in first.');
  const { data, error } = await db
    .from('profiles')
    .upsert({ user_id: id, display_name: input.display_name.trim(), is_public: input.is_public, tz: deviceTimeZone(), updated_at: new Date().toISOString() })
    .select('user_id, display_name, is_public, tz, avatar_path')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('That name is taken. Try another.');
    if (error.code === '23514') throw new Error('Names are 2 to 24 characters.');
    throw error;
  }
  return data;
}

export async function leaderboard(board: Board, scope: Scope): Promise<BoardRow[]> {
  const { data, error } = await client().rpc('leaderboard', { board, scope, max_rows: 100 });
  if (error) throw error;
  return (data ?? []) as BoardRow[];
}

export async function setRival(rivalId: string, on: boolean): Promise<void> {
  const db = client();
  const { error } = on
    ? await db.from('rivals').insert({ rival_id: rivalId })
    : await db.from('rivals').delete().eq('rival_id', rivalId);
  if (error) throw error;
}

/** Public players whose name contains `query`, for adding rivals. */
export async function findPlayers(query: string): Promise<Profile[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await client()
    .from('profiles')
    .select('user_id, display_name, is_public, tz, avatar_path')
    .eq('is_public', true)
    .ilike('display_name', `%${q.replace(/[%_]/g, '\\$&')}%`)
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

const AVATARS = 'avatars';

/** Public URL of a stored avatar (`<user id>/<timestamp>.jpg`). */
export function avatarUrl(path: string): string {
  return client().storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
}

/** Avatar URLs for the players on a board, by user id (players without one are left out). */
export async function avatarUrls(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const { data, error } = await client().from('profiles').select('user_id, avatar_path').in('user_id', userIds).not('avatar_path', 'is', null);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((p) => [p.user_id, avatarUrl(p.avatar_path as string)]));
}

/**
 * Put `bytes` (a small JPEG) up as your avatar, or remove it with null, and point your
 * profile at it; the previous file is deleted. False without a leaderboard profile (nothing to
 * attach it to yet).
 */
export async function setRemoteAvatar(bytes: ArrayBuffer | Uint8Array | null): Promise<boolean> {
  const db = client();
  const profile = await myProfile();
  if (!profile) return false;
  let path: string | null = null;
  if (bytes) {
    path = `${profile.user_id}/${Date.now()}.jpg`;
    const { error } = await db.storage.from(AVATARS).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
  }
  const { error } = await db.from('profiles').update({ avatar_path: path, updated_at: new Date().toISOString() }).eq('user_id', profile.user_id);
  if (error) throw error;
  if (profile.avatar_path && profile.avatar_path !== path) await db.storage.from(AVATARS).remove([profile.avatar_path]);
  return true;
}

/** Delete every avatar file of yours (before deleting your account). */
export async function removeAllAvatars(): Promise<void> {
  const db = client();
  const { data: auth } = await db.auth.getSession();
  const id = auth.session?.user.id;
  if (!id) return;
  const { data, error } = await db.storage.from(AVATARS).list(id);
  if (error) throw error;
  if (data?.length) await db.storage.from(AVATARS).remove(data.map((f) => `${id}/${f.name}`));
}

