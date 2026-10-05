import type { ConfigContext, ExpoConfig } from 'expo/config';

export type SpamsetEnvironment = 'dev-spamset' | 'prod-spamset';

const PROFILE_ENVIRONMENT: Record<string, SpamsetEnvironment> = {
  development: 'dev-spamset',
  preview: 'dev-spamset',
  production: 'prod-spamset',
};

/**
 * The self-hosted Supabase stack behind each environment (Hostinger VPS, Caddy in front of Kong).
 */
export const SUPABASE_URL: Record<SpamsetEnvironment, string> = {
  'dev-spamset': 'https://spamset-dev.loadoutlog.com',
  'prod-spamset': 'https://spamset-api.loadoutlog.com',
};

function isSpamsetEnvironment(value: string | undefined): value is SpamsetEnvironment {
  return value === 'dev-spamset' || value === 'prod-spamset';
}

/**
 * The build's environment. Every EAS profile sets SPAMSET_ENV; local Expo commands default to
 * development, and nothing ever guesses production. On EAS the profile is checked too, so a
 * mistyped profile cannot pair a dev binary with prod-spamset (or the reverse).
 */
export function resolveConfigEnvironment(env: Readonly<Record<string, string | undefined>>): SpamsetEnvironment {
  const requested = env.SPAMSET_ENV;
  if (requested !== undefined && !isSpamsetEnvironment(requested)) {
    throw new Error(`Invalid SPAMSET_ENV: ${requested}`);
  }
  const expectedForProfile = env.EAS_BUILD_PROFILE ? PROFILE_ENVIRONMENT[env.EAS_BUILD_PROFILE] : undefined;
  if (env.EAS_BUILD === 'true' && !expectedForProfile) {
    throw new Error(`Unknown EAS build profile: ${env.EAS_BUILD_PROFILE ?? '(missing)'}`);
  }
  const resolved = requested ?? expectedForProfile ?? 'dev-spamset';
  if (expectedForProfile && resolved !== expectedForProfile) {
    throw new Error(`EAS profile ${env.EAS_BUILD_PROFILE} requires ${expectedForProfile}, received ${resolved}`);
  }
  const configured = env.EXPO_PUBLIC_SUPABASE_URL;
  if (configured && configured !== SUPABASE_URL[resolved]) {
    throw new Error(`${resolved} requires ${SUPABASE_URL[resolved]}, received ${configured}`);
  }
  return resolved;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  if (!config.name || !config.slug) throw new Error('Expo app name and slug are required.');
  const spamsetEnv = resolveConfigEnvironment(process.env);
  return {
    ...config,
    name: config.name,
    slug: config.slug,
    extra: { ...config.extra, spamsetEnv, supabaseUrl: SUPABASE_URL[spamsetEnv] },
  };
};
