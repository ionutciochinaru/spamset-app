import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** dev-spamset or prod-spamset, and the stack it must talk to (set by app.config.ts). */
const extra = Constants.expoConfig?.extra as
  | { spamsetEnv?: string; supabaseUrl?: string; googleWebClientId?: string }
  | undefined;
export const spamsetEnv = extra?.spamsetEnv ?? null;
/** The stack's Google Web client, for native Google sign-in on Android. */
export const googleWebClientId = extra?.googleWebClientId ?? null;

/**
 * Null when no Supabase stack is configured, or when the bundled URL is not this build's
 * environment (an OTA bundle for another environment): the app then runs offline-only rather
 * than syncing into the wrong database.
 */
export const supabase: SupabaseClient | null =
  url && key && url === extra?.supabaseUrl
    ? createClient(url, key, {
        auth: {
          storage: typeof localStorage === 'undefined' ? undefined : localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      })
    : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
