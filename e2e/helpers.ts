import { expect, type Page } from '@playwright/test';

/**
 * A fresh browser is a first run: «Сегодня» opens with the onboarding (#41). Scenarios about other
 * things skip it the way a user would and land on «Сегодня».
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await expect(page.getByRole('heading', { name: 'Сегодня', level: 1 })).toBeVisible();
}
