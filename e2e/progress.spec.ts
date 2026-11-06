import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test('Given пустая база When я открываю «Прогресс» Then уровень 1, подсказка про опыт, без горизонтального скролла', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/progress');
  await expect(page.getByRole('heading', { name: 'Прогресс', level: 1 })).toBeVisible();
  await expect(page.getByTestId('level')).toHaveText('1');
  await expect(page.getByText('Пока нет опыта. Он начисляется за:')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
