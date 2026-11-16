import { describe, expect, it } from 'vitest';
import architecture from '../../../docs/architecture.md?raw';
import { LOCAL_ONLY_SETTING_KEYS } from '../sync/localOnly';
import { AGE_RULES, CONSENT_KINDS } from './index';

/** The text of the `##` section «Облако» of docs/architecture.md, with its `###` subsections. */
function cloudSection(): string {
  const start = architecture.search(/^## Облако/m);
  if (start < 0) return '';
  const rest = architecture.slice(start + 3);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('docs/architecture.md', () => {
  it('Given docs/architecture.md When читаю раздел «Облако» Then описаны аккаунт, сессия, виды согласий и что проверяет сервер', () => {
    const cloud = cloudSection();
    expect(cloud).toMatch(/^### Аккаунт и согласия/m);
    const rest = cloud.slice(cloud.search(/^### Аккаунт и согласия/m) + 4);
    const end = rest.search(/^### /m);
    const section = end < 0 ? rest : rest.slice(0, end);

    // The account: how to sign in, and that a build without a backend is local-only.
    for (const name of [
      'useAccount()',
      'requestSignIn',
      'completeSignIn',
      '`unavailable`',
      'signOut',
      'deleteAccount',
    ]) {
      expect(section).toContain(name);
    }
    // The session: where it lives and that it never leaves the device.
    expect(section).toContain('getAccessToken');
    for (const key of ['account.session', 'account.consents']) {
      expect(LOCAL_ONLY_SETTING_KEYS).toContain(key);
      expect(section).toContain(`\`${key}\``);
    }
    // Every kind of consent and every age rule is named.
    for (const kind of CONSENT_KINDS) expect(section).toContain(`\`${kind}\``);
    for (const rule of AGE_RULES) expect(section).toContain(`\`${rule}\``);
    for (const name of ['recordConsent', 'useConsents()', 'HEALTH_TABLES']) expect(section).toContain(name);
    // What the server checks.
    expect(section).toMatch(/Что проверяет сервер/);
    for (const name of ['profiles', 'consents', 'sync_push', 'delete_account()', 'RLS', 'account.test.sh']) {
      expect(section).toContain(name);
    }
    expect(section).toContain('](adr/0013-account-session-consents.md)');
  });
});
