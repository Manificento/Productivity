import { expect, test } from '@playwright/test';

test.describe('time', () => {
  test('starter categories, timer survives reload, stop', async ({ page }) => {
    await page.goto('/#/time');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();

    await page.getByRole('button', { name: 'Учёба' }).click();
    const timer = page.getByRole('timer', { name: 'Идущий таймер' });
    await expect(timer).toContainText('Учёба');
    await expect(timer).toContainText(/00:0[0-9]/);

    await page.waitForTimeout(1500);
    await page.reload();
    await expect(timer).toContainText('Учёба');
    // continues from the original start instead of restarting at 00:00
    await expect(timer).not.toContainText('00:00');

    await page.getByRole('button', { name: 'Стоп' }).click();
    await expect(timer).toBeHidden();
  });

  test('manual entry rejects an end before the start', async ({ page }) => {
    await page.goto('/#/time');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();
    await page.getByRole('button', { name: '+ Запись вручную' }).click();

    const dialog = page.getByRole('dialog', { name: 'Запись вручную' });
    await dialog.getByLabel('Начало').fill('2026-11-02T09:00');
    await dialog.getByLabel('Конец').fill('2026-11-02T08:00');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Конец должен быть позже начала');

    await dialog.getByLabel('Конец').fill('2026-11-02T10:00');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('status')).toHaveText('Запись сохранена');
  });

  test('no horizontal scroll on the time screen at 360 px', async ({ page }) => {
    await page.goto('/#/time');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();
    await page.getByRole('button', { name: 'Работа' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('pomodoro', () => {
  test('focus runs 25 minutes, then a 5-minute break; durations persist', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-02T09:00:00+05:00') });
    await page.goto('/#/time/pomodoro');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();

    const timer = page.getByRole('timer', { name: 'Pomodoro' });
    await expect(timer).toContainText('25:00');
    // daily quota from adaptation (default baseline: 4 focus sessions)
    await expect(page.getByText('0 из 4', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Фокус-сессии сегодня' })).toBeVisible();
    await page.getByRole('button', { name: 'Начать фокус' }).click();
    await expect(timer).toContainText('Фокус · сессия 1 из 4');

    await page.clock.fastForward('25:00');
    await expect(timer).toContainText('Перерыв');
    await expect(timer).toContainText(/0[45]:\d\d/);

    await expect(page.getByText('1 из 4', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Пропустить перерыв' }).click();
    await page.getByRole('button', { name: /^Длительности/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Настройки Pomodoro' });
    await dialog.getByLabel('Фокус, мин').fill('50');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(timer).toContainText('50:00');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Длительности: 50 / 5 / 15 мин' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Given идёт фокус-сессия When я перехожу в другой модуль и сессия заканчивается Then звучит сигнал и создаётся запись', async ({
    page,
  }) => {
    // Count vibrations: the signal's observable part in a headless browser.
    await page.addInitScript(() => {
      const w = window as unknown as { vibrations: number };
      w.vibrations = 0;
      Object.defineProperty(navigator, 'vibrate', { value: () => ++w.vibrations > 0, configurable: true });
    });
    await page.clock.install({ time: new Date('2026-11-02T09:00:00+05:00') });
    await page.goto('/#/time/pomodoro');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();
    await page.getByRole('button', { name: 'Начать фокус' }).click();
    await expect(page.getByRole('timer', { name: 'Pomodoro' })).toContainText('Фокус · сессия 1 из 4');

    await page.getByRole('link', { name: /Задачи/ }).click();
    await expect(page.getByRole('heading', { name: 'Задачи', level: 1 })).toBeVisible();
    await page.clock.fastForward('25:01');
    await expect.poll(() => page.evaluate(() => (window as unknown as { vibrations: number }).vibrations)).toBe(1);

    await page.getByRole('link', { name: /Время/ }).click();
    await page.getByRole('link', { name: 'Pomodoro' }).click();
    await expect(page.getByText('1 из 4', { exact: true })).toBeVisible();
  });
});

test.describe('balance', () => {
  test('empty state links to the timer; a running timer shows up as a bar', async ({ page }) => {
    await page.goto('/#/time/balance');
    await page.getByRole('link', { name: 'Открыть таймер' }).click();
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();
    await page.getByRole('button', { name: 'Учёба' }).click();
    await expect(page.getByRole('timer', { name: 'Идущий таймер' })).toBeVisible();

    await page.getByRole('link', { name: 'Баланс' }).click();
    const week = page.getByRole('list', { name: 'Неделя по категориям' });
    await expect(week.getByRole('listitem').filter({ hasText: 'Учёба' })).toBeVisible();
    await expect(week.locator('svg rect[data-testid="bar"]')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
