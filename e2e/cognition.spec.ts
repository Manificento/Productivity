import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

/**
 * PVT end to end on Playwright's fake clock, so the run does not depend on the runner's speed.
 * During a PVT run the clock is paused (`pauseAt`): `performance.now()`, `requestAnimationFrame`
 * and `Date` move only on `page.clock.runFor`. Before, the run used real time: a stimulus rescheduled
 * near the end of the 12 s run could be clicked after time was up on a slow runner, so no reaction
 * counted and nothing was saved (the flaky «Результат сохранён.» failure, issue #64).
 * `?duration=12` is honoured only under WebDriver / the dev server; 12 s guarantees a stimulus
 * (2–10 s after the last tap) before the end.
 */
const START = new Date('2026-11-04T08:00:00+05:00');
/** Fake-clock step while waiting for the stimulus. */
const STEP_MS = 250;
/** How long after seeing the stimulus we "react". */
const REACTION_MS = 300;

/** Advances the fake clock until the stimulus is on screen (it comes 2–10 s after the last tap). */
async function waitForStimulus(page: Page) {
  const stimulus = page.getByText('Жми!');
  for (let waited = 0; waited <= 10_000 + STEP_MS; waited += STEP_MS) {
    if (await stimulus.isVisible()) return;
    await page.clock.runFor(STEP_MS);
  }
  await expect(stimulus).toBeVisible();
}

test.describe('cognition: PVT', () => {
  test('a short run from the morning flow: false start, reaction, results, back to Today, history', async ({
    page,
  }) => {
    await page.clock.install({ time: START });
    await skipOnboarding(page);

    for (let run = 1; run <= 2; run++) {
      await page.goto('/#/cognition/pvt?return=/&duration=12');
      // Pause relative to the page's current (fake) time, so no real-time budget is hidden here.
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + 1_000);
      await page.getByRole('button', { name: 'Начать' }).click();
      const area = page.getByRole('button', { name: 'Область реакции' });

      if (run === 1) {
        await page.clock.runFor(500);
        await area.click();
        await expect(page.getByText('Фальстарт — рано!')).toBeVisible();
      }

      await waitForStimulus(page);
      await page.clock.runFor(REACTION_MS);
      await area.click();
      await expect(page.getByText(/^\d+ мс$/)).toBeVisible();

      // Let the 12 s run end; then hand the clock back so saving to IndexedDB is never starved.
      await page.clock.runFor(12_000);
      await page.clock.resume();
      await expect(page.getByText('Медиана реакции')).toBeVisible();
      // The stimulus appears somewhere inside the last fake-clock step, then we wait REACTION_MS.
      const medianMs = parseInt(
        (await page.getByText('Медиана реакции').locator('xpath=following-sibling::dd[1]').textContent()) ?? '',
      );
      expect(medianMs).toBeGreaterThanOrEqual(REACTION_MS);
      expect(medianMs).toBeLessThanOrEqual(REACTION_MS + STEP_MS);
      await expect(page.getByText('Результат сохранён.')).toBeVisible();
      if (run === 1)
        await expect(page.getByText('Фальстарты').locator('xpath=following-sibling::dd[1]')).toHaveText('1');

      await page.getByRole('button', { name: 'Готово' }).click();
      await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
    }

    await page.goto('/#/cognition');
    await expect(page.getByRole('img', { name: /Медиана реакции за 14 дней/ })).toBeVisible();
    await expect(page.getByText(/Последний результат/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('cognition: n-back', () => {
  test('a short session from the module screen: instruction at n = 2, play, result saved, history chart', async ({
    page,
  }) => {
    await page.clock.install({ time: START });
    await skipOnboarding(page);
    await page.goto('/#/cognition');
    await page.getByRole('link', { name: 'n-back' }).click();
    await expect(page.getByText('Как проходить')).toBeVisible();
    await expect(page.getByText(/Ваш уровень: n =/)).toContainText('n = 2');

    await page.goto('/#/cognition/nback?duration=10');
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1_000);
    await page.getByRole('button', { name: 'Начать' }).click();
    await expect(page.getByTestId('nback-cell').first()).toBeVisible();
    await page.getByRole('button', { name: 'Совпало' }).click();
    await page.clock.runFor(10_500);
    await page.clock.resume();
    await expect(page.getByText('Результат сохранён.')).toBeVisible();
    await expect(page.getByText('Точность').locator('xpath=following-sibling::dd[1]')).toHaveText(/^\d+%$/);

    await page.getByRole('link', { name: 'Готово' }).click();
    await expect(page.getByRole('img', { name: /Уровень и точность n-back по дням/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('cognition: Stroop and Schulte', () => {
  test('both trainers run, show a summary and appear in the exercise list with the last result', async ({ page }) => {
    await page.goto('/');
    await skipOnboarding(page);

    await page.goto('/#/cognition/stroop?duration=3');
    await page.getByRole('button', { name: 'Начать' }).click();
    await page.getByRole('button', { name: 'Красный' }).click();
    await expect(page.getByText('Результат сохранён.')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Эффект интерференции', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Готово' }).click();

    await page.goto('/#/cognition/schulte');
    await page.getByRole('button', { name: 'Начать' }).click();
    for (let n = 1; n <= 25; n++) await page.getByRole('button', { name: String(n), exact: true }).click();
    await expect(page.getByText('Результат сохранён.')).toBeVisible();
    await expect(page.getByText('Время', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Готово' }).click();

    const list = page.getByText('Упражнения').locator('xpath=ancestor::div[1]');
    await expect(list.getByRole('link', { name: 'Струп' })).toBeVisible();
    await expect(list.getByText(/^точность \d+%/)).toBeVisible();
    await expect(list.getByText(/ошибок 0/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('cognition: daily plan', () => {
  test('the block shows today’s plan from the daily targets and counts a finished session', async ({ page }) => {
    await page.goto('/');
    await skipOnboarding(page);
    await page.goto('/#/cognition');
    await expect(page.getByText('Сегодня 10 мин: n-back 5 мин, Струп 5 мин')).toBeVisible();
    await expect(page.getByText('Выполнено 0 из 10 мин')).toBeVisible();

    await page.getByRole('link', { name: 'Начать: Струп' }).click();
    await page.goto('/#/cognition/stroop?duration=3');
    await page.getByRole('button', { name: 'Начать' }).click();
    await page.getByRole('button', { name: 'Красный' }).click();
    await expect(page.getByText('Результат сохранён.')).toBeVisible({ timeout: 8_000 });
    await page.getByRole('link', { name: 'Готово' }).click();
    await expect(page.getByRole('list', { name: 'Сегодня сделано' })).toContainText('Струп');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
