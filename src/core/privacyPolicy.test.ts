import { describe, expect, it } from 'vitest';
// The page the Health Connect permission screen opens (`file:///android_asset/public/privacypolicy.html`, plugin
// `@capgo/capacitor-health`): Vite copies `public/` into the build, `cap sync` into `assets/public/`.
import policy from '../../public/privacypolicy.html?raw';

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
    // Contact.
    expect(text).toMatch(/almasakhmediyar@gmail\.com/);
  });

  it('is a self-contained page: no scripts, no external resources', () => {
    expect(policy).not.toMatch(/<script/i);
    expect(policy).not.toMatch(/(src|href)="https?:/i);
  });
});
