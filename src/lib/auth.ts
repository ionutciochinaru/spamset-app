import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type Provider = 'google' | 'apple';

function requireClient() {
  if (!supabase) throw new Error('Accounts are not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}

/** Browser OAuth with PKCE. Web redirects the page; native uses an auth session and exchanges the code. */
async function signInWithBrowser(provider: Provider): Promise<boolean> {
  const client = requireClient();
  if (Platform.OS === 'web') {
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) throw error;
    return false; // The page navigates away; the session is picked up on return.
  }
  const redirectTo = makeRedirectUri({ path: 'auth-callback' });
  const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error_description) throw new Error(String(queryParams.error_description));
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error('Sign-in did not return an authorization code.');
  const exchange = await client.auth.exchangeCodeForSession(code);
  if (exchange.error) throw exchange.error;
  return true;
}

export async function signInWithGoogle(): Promise<boolean> {
  return signInWithBrowser('google');
}

/** Native Sign in with Apple on iOS; browser OAuth on Android and web. */
export async function signInWithApple(): Promise<boolean> {
  const client = requireClient();
  if (Platform.OS !== 'ios') return signInWithBrowser('apple');
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
    const { error } = await client.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
    if (error) throw error;
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
}

/** Delete the signed-in account and everything synced to it (supabase/migrations/0003_delete_account.sql). */
export async function deleteAccount() {
  const client = requireClient();
  const { error } = await client.rpc('delete_account');
  if (error) throw error;
  // The user no longer exists on the server, so only drop the session here.
  await client.auth.signOut({ scope: 'local' });
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export const accountsEnabled = supabase !== null;
