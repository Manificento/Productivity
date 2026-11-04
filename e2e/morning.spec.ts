import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test('morning flow in a few taps: sleep, check-in, test link, collapse', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T07:45:00+05:00'));
  await skipOnboarding(page);
  const card = page.getByRole('region', { name: 'Утро: 3 минуты' });
  await expect(card.getByText('Лёг 23:30 · встал 07:30')).toBeVisible();

  await card.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(card.getByText(/23:30–07:30, 8 ч/)).toBeVisible();

  const feel = card.getByRole('region', { name: 'Самочувствие' });
  await feel.getByRole('radio', { name: 'Энергия: 4' }).click();
  await feel.getByRole('radio', { name: 'Фокус: 4' }).click();
  await feel.getByRole('button', { name: 'Сохранить' }).click();
  await expect(feel).toContainText('Энергия 4/5 · фокус 4/5');

  await card.getByRole('link', { name: 'Пройти тест' }).click();
  await expect(page).toHaveURL(/#\/cognition\/pvt\?return=\//);
  await page.goBack();

  await page.getByRole('region', { name: 'Утро: 3 минуты' }).getByRole('button', { name: 'Пропустить тест' }).click();
  await expect(page.getByRole('button', { name: /Утро ✓/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
