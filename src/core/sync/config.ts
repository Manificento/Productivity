/**
 * The one place where the app learns which cloud backend to talk to (ADR-0009, cells by region).
 *
 * Every region is a separate deployment of the same stack (`infra/supabase/`) with its own Postgres and Auth; there
 * is no replication between regions. A user's `region` is set once, when the account is created, and lives in the
 * profile; the client connects to that region's backend only. The address and the public (anon) key of each region
 * come from the build environment, so a new deployment needs variables, not code:
 *
 *   VITE_SUPABASE_URL_KZ=https://api.example.kz        VITE_SUPABASE_ANON_KEY_KZ=…
 *   VITE_SUPABASE_URL_EU=https://<project>.supabase.co VITE_SUPABASE_ANON_KEY_EU=…   (staging, synthetic data only)
 *
 * Web and native builds read the same variables.
 */

/** Regions the app can serve; adding one is a new deployment plus its code here. */
export const REGIONS = ['kz', 'eu'] as const;

export type Region = (typeof REGIONS)[number];

/** Region of new accounts: closed tests run in Kazakhstan, data stays in the RK (law No. 94-V). */
export const DEFAULT_REGION: Region = 'kz';

export interface BackendConfig {
  region: Region;
  /** Base URL of the region's API gateway, without a trailing slash. */
  url: string;
  /** Public key of the region; safe in the client, rows are guarded by RLS. */
  anonKey: string;
}

export type BackendEnv = Readonly<Record<string, unknown>>;

export function isRegion(value: unknown): value is Region {
  return typeof value === 'string' && (REGIONS as readonly string[]).includes(value);
}

/**
 * Backend of the region stored in the user's profile. `null` when the region is unknown to this app or the build has
 * no backend for it — the caller stays local-only and never falls back to another region (that would move the user's
 * data across jurisdictions).
 */
export function backendFor(profileRegion: string, env: BackendEnv = import.meta.env): BackendConfig | null {
  if (!isRegion(profileRegion)) return null;
  const suffix = profileRegion.toUpperCase();
  const url = env[`VITE_SUPABASE_URL_${suffix}`];
  const anonKey = env[`VITE_SUPABASE_ANON_KEY_${suffix}`];
  if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') return null;
  return { region: profileRegion, url: url.replace(/\/+$/, ''), anonKey };
}

/**
 * Backend a NEW sign-in goes to — there is no profile yet, so no region to read from it: the default region when
 * this build has it, otherwise the first region the build is configured for (a staging build knows only `eu`).
 * `null` — the build has no cloud backend at all: the app is local-only and makes no account request.
 */
export function signInBackend(env: BackendEnv = import.meta.env): BackendConfig | null {
  for (const region of [DEFAULT_REGION, ...REGIONS]) {
    const backend = backendFor(region, env);
    if (backend) return backend;
  }
  return null;
}
