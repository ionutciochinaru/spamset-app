/**
 * Leaderboards on Supabase: your public profile, boards and rivals. XP itself is computed
 * by the server from synced spam sets (supabase/migrations/0002_leaderboard.sql); boards
 * only show players who made their profile public.
 */
import { supabase } from './supabase';

export type Board = 'all' | 'week' | 'streak';
export type Scope = 'everyone' | 'rivals';

export type Profile = { user_id: string; display_name: string; is_public: boolean; tz: string };

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
  const { data, error } = await db.from('profiles').select('user_id, display_name, is_public, tz').eq('user_id', id).maybeSingle();
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
    .select('user_id, display_name, is_public, tz')
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
    .select('user_id, display_name, is_public, tz')
    .eq('is_public', true)
    .ilike('display_name', `%${q.replace(/[%_]/g, '\\$&')}%`)
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
