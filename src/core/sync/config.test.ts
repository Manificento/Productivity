import { describe, expect, it } from 'vitest';
import { backendFor, DEFAULT_REGION, isRegion, REGIONS } from './config';

const TWO_REGIONS = {
  VITE_SUPABASE_URL_KZ: 'https://api.kz.example',
  VITE_SUPABASE_ANON_KEY_KZ: 'anon-kz',
  VITE_SUPABASE_URL_EU: 'https://staging.eu.example/',
  VITE_SUPABASE_ANON_KEY_EU: 'anon-eu',
};

describe('backendFor', () => {
  it('Given переменные второго региона (staging в ЕС) When задаются Then клиент выбирает регион из профиля пользователя, код не меняется', () => {
    expect(backendFor('kz', TWO_REGIONS)).toEqual({ region: 'kz', url: 'https://api.kz.example', anonKey: 'anon-kz' });
    expect(backendFor('eu', TWO_REGIONS)).toEqual({
      region: 'eu',
      url: 'https://staging.eu.example',
      anonKey: 'anon-eu',
    });
  });

  it('returns null when the build has no backend for the region — never another region instead', () => {
    const onlyKz = { VITE_SUPABASE_URL_KZ: 'https://api.kz.example', VITE_SUPABASE_ANON_KEY_KZ: 'anon-kz' };
    expect(backendFor('eu', onlyKz)).toBeNull();
    expect(backendFor('kz', { VITE_SUPABASE_URL_KZ: 'https://api.kz.example' })).toBeNull();
    expect(backendFor('kz', { VITE_SUPABASE_URL_KZ: '', VITE_SUPABASE_ANON_KEY_KZ: 'anon-kz' })).toBeNull();
  });

  it('returns null for a profile region the app does not know, instead of falling back to the default region', () => {
    expect(
      backendFor('us', { ...TWO_REGIONS, VITE_SUPABASE_URL_US: 'https://us', VITE_SUPABASE_ANON_KEY_US: 'k' }),
    ).toBeNull();
    expect(backendFor('', TWO_REGIONS)).toBeNull();
  });

  it('reads the build environment by default and has nothing configured in tests', () => {
    expect(backendFor('kz')).toBeNull();
  });
});

describe('regions', () => {
  it('new accounts start in Kazakhstan; kz and eu are the known regions', () => {
    expect(DEFAULT_REGION).toBe('kz');
    expect(REGIONS).toEqual(['kz', 'eu']);
    expect(isRegion('eu')).toBe(true);
    expect(isRegion('EU')).toBe(false);
    expect(isRegion(undefined)).toBe(false);
  });
});
