import { describe, expect, it } from 'vitest';
// The policy page (owner's decision 2026-11-07: `public/privacy/index.html`, Russian + English, web address
// `/privacy/`). Vite copies `public/` into the build, `cap sync` into `assets/public/`; the Health Connect permission
// screen opens it through `health_connect_privacy_policy_url` (android/…/strings.xml).
import policy from '../../public/privacy/index.html?raw';

const text = policy.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('privacy policy for Health Connect (#214)', () => {
  it('Given окно разрешений Health Connect When я нажимаю «Политика конфиденциальности» Then открывается текст политики LifeOS на русском (что читается: сон и тренировки; где хранится: только на устройстве до облака; что не передаётся)', () => {
    expect(policy).toMatch(/<html lang="ru">/);
    expect(policy).toMatch(/<meta name="viewport"/);
    expect(text).toMatch(/Политика конфиденциальности LifeOS/);
    // What is read.
    expect(text).toMatch(/только сон и тренировки/);
    // Where it is kept.
    expect(text).toMatch(/только на этом устройстве/i);
    expect(text).toMatch(/Облака пока нет/);
    // What is not shared.
    expect(text).toMatch(/не уходят на серверы, третьим лицам, в рекламу или аналитику/);
    expect(text).toMatch(/Open Food Facts/);
    // Night sensing: the microphone gives a level only.
    expect(text).toMatch(/Звук не записывается и не сохраняется/);
    // Contact.
    expect(text).toMatch(/almasakhmediyar@gmail\.com/);
  });

  it('has the same policy in English', () => {
    expect(policy).toMatch(/<section lang="en"/);
    expect(text).toMatch(/reads only sleep and workouts/);
    expect(text).toMatch(/Only on this device/);
    expect(text).toMatch(/not sent to servers, third parties, advertising or analytics/);
  });

  it('is a self-contained page: no scripts, no links (the in-app viewer has JavaScript off and no mail app)', () => {
    expect(policy).not.toMatch(/<script/i);
    expect(policy).not.toMatch(/(src|href)=/i);
  });
});
