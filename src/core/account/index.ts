/**
 * The cloud account of the core (contract #278, ADR-0009): sign-in by e-mail, the session on this device, the
 * consent journal, account deletion. Modules import from here; the screens are theirs (`settings`).
 *
 * A build without a cloud backend (`VITE_SUPABASE_URL_<REGION>`) answers `unavailable` everywhere and makes no
 * network request: the app stays local-only.
 */
export { completeSignIn, deleteAccount, requestSignIn, signInCodeFromUrl, signOut } from './account';
export { recordConsent, refreshConsents } from './consentStore';
export {
  AGE_RULES,
  CONSENT_KINDS,
  effectiveConsents,
  isGranted,
  type AgeRule,
  type Consent,
  type ConsentDetails,
  type ConsentKind,
  type EffectiveConsents,
} from './consents';
export { AccountError, type AccountErrorKind } from './errors';
export { getAccessToken, type AccountState } from './session';
export { useAccount } from './useAccount';
export { useConsents, type ConsentsState } from './useConsents';
