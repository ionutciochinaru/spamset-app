import { resolveConfigEnvironment, SUPABASE_URL } from '../../../app.config';

describe('resolveConfigEnvironment', () => {
  it('defaults local commands to development, never production', () => {
    expect(resolveConfigEnvironment({})).toBe('dev-spamset');
  });

  it('follows the EAS profile', () => {
    expect(resolveConfigEnvironment({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'preview' })).toBe('dev-spamset');
    expect(resolveConfigEnvironment({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production' })).toBe('prod-spamset');
  });

  it('rejects a profile paired with the other environment', () => {
    expect(() =>
      resolveConfigEnvironment({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'development', SPAMSET_ENV: 'prod-spamset' }),
    ).toThrow('requires dev-spamset');
  });

  it('rejects unknown environments and profiles', () => {
    expect(() => resolveConfigEnvironment({ SPAMSET_ENV: 'prod' })).toThrow('Invalid SPAMSET_ENV');
    expect(() => resolveConfigEnvironment({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'staging' })).toThrow('Unknown EAS build profile');
  });

  it("rejects a Supabase URL that is not the environment's stack", () => {
    expect(() =>
      resolveConfigEnvironment({ EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL['prod-spamset'] }),
    ).toThrow('dev-spamset requires');
    expect(() => resolveConfigEnvironment({ EXPO_PUBLIC_SUPABASE_URL: 'https://dev-api.loadoutlog.com' })).toThrow();
    expect(resolveConfigEnvironment({ EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL['dev-spamset'] })).toBe('dev-spamset');
  });
});
