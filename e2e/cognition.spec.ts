import { expect, test, type Page } from '@playwright/test';

/**
 * PVT end to end on Playwright's fake clock, so the run does not depend on the runner's speed.
 * `performance.now()`, `requestAnimationFrame` and `Date` are frozen and advanced only by
 * `page.clock.runFor`. Real time used to decide how fast a slow runner "reacted": a stimulus
 * rescheduled near the end of a 12 s run could be clicked after time was up, so no reaction
 * counted and nothing was saved (the flaky «Результат сохранён.» failure).
 */
const START = new Date('2026-11-04T08:00:00');

/** Advances the fake clock until the stimulus is on screen (it comes 2–10 s after the last tap). */
async function waitForStimulus(page: Page) {
  const stimulus = page.getByText('Жми!');
  for (let waited = 0; waited <= 10_500; waited += 250) {
    if (await stimulus.isVisible()) return;
    await page.clock.runFor(250);
  }
  await expect(stimulus).toBeVisible();
}

test.describe('cognition: PVT', () => {
  test('a short run from the morning flow: false start, reaction, results, back to Today, history', async ({
    page,
  }) => {
    await page.clock.install({ time: START });

    for (let run = 1; run <= 2; run++) {
      await page.goto('/#/cognition/pvt?return=/&duration=12');
      await page.clock.pauseAt(new Date(START.getTime() + run * 60_000));
      await page.getByRole('button', { name: 'Начать' }).click();
      const area = page.getByRole('button', { name: 'Область реакции' });

      if (run === 1) {
        await page.clock.runFor(500);
        await area.click();
        await expect(page.getByText('Фальстарт — рано!')).toBeVisible();
      }

      await waitForStimulus(page);
      await page.clock.runFor(300);
      await area.click();
      await expect(page.getByText(/^\d+ мс$/)).toBeVisible();

      // Let the 12 s run end; then hand the clock back so saving to IndexedDB is never starved.
      await page.clock.runFor(12_000);
      await page.clock.resume();
      await expect(page.getByText('Медиана реакции')).toBeVisible();
      // The stimulus appears somewhere inside the last 250 ms step, then we wait 300 ms: RT is 300–550 ms.
      const medianMs = parseInt(
        (await page.getByText('Медиана реакции').locator('xpath=following-sibling::dd[1]').textContent()) ?? '',
      );
      expect(medianMs).toBeGreaterThanOrEqual(300);
      expect(medianMs).toBeLessThanOrEqual(550);
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
