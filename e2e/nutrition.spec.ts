import { expect, test } from '@playwright/test';

test.describe('nutrition weight', () => {
  test('Given пустой журнал When ввожу 72,4 и ещё раз 72,0 Then одна запись за день; 400 — ошибка', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/nutrition');
    await expect(page.getByText(/Записей веса пока нет/)).toBeVisible();
    await page.getByLabel('Вес, кг').fill('400');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByRole('alert')).toContainText('кг');
    await page.getByLabel('Вес, кг').fill('72,4');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByText('Записано: 72,4 кг')).toBeVisible();
    await page.getByLabel('Вес, кг').fill('72,0');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByRole('img', { name: /Вес: записей 1/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Given вес и профиль When выбираю «Снизить» Then цели дня считаются со стартовой оценкой', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/nutrition');
    await page.getByLabel('Вес, кг').fill('80');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByText('Записано: 80 кг')).toBeVisible();
    await page.getByLabel('Рост, см').fill('180');
    await page.getByLabel('Год рождения').fill('1996');
    await page.getByRole('button', { name: 'Сохранить данные' }).click();
    await page.getByRole('radio', { name: 'Снизить' }).click();
    await page.getByRole('button', { name: 'Сохранить цель' }).click();
    await expect(page.getByText('Цель сохранена')).toBeVisible();
    const targets = page.getByRole('group', { name: 'Цели дня по питанию' });
    await expect(targets).toContainText('2050 ккал');
    await expect(targets).toContainText('уточним через 14 дней');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Given цель и расход When я добавляю еду Then шкала «Калории» показывает съедено и остаток; без цели — «Задать цель»', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T10:00:00'));
    await page.goto('/#/nutrition');
    await expect(page.getByRole('button', { name: 'Задать цель' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Калории' })).toHaveCount(0);

    await page.getByLabel('Вес, кг').fill('80');
    await page.getByRole('button', { name: 'Записать' }).click();
    await page.getByLabel('Рост, см').fill('180');
    await page.getByLabel('Год рождения').fill('1996');
    await page.getByRole('button', { name: 'Сохранить данные' }).click();
    await page.getByRole('radio', { name: 'Удержать' }).click();
    await page.getByRole('button', { name: 'Сохранить цель' }).click();

    const day = page.getByRole('region', { name: 'Цель на день' });
    await expect(day).toContainText('0 / 2490 ккал');
    await expect(day).toContainText('Осталось 2490 ккал');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
