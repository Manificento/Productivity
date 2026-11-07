import { expect, test } from '@playwright/test';

/** Open Food Facts is mocked in E2E: no real network in tests. */
const OFF_ROUTE = 'https://world.openfoodfacts.org/**';

test.describe('health', () => {
  test('log last night, update it, and see it in the 14-day chart', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await expect(page.getByLabel('День подъёма')).toHaveValue('2026-11-04');
    await expect(page.getByRole('heading', { name: 'Сон', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Отбой', { exact: true })).toHaveValue('23:30');
    await expect(page.getByLabel('Подъём', { exact: true })).toHaveValue('07:30');
    await expect(page.getByText('Записей пока нет')).toBeVisible();

    await page.getByLabel('Подъём', { exact: true }).fill('07:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Сохранено: 7,5 ч')).toBeVisible();
    await expect(page.getByRole('img', { name: /Длительность сна за 14 дней: записей 1/ })).toBeVisible();
    await expect(page.getByText('Среднее за 7 дней: 7,5 ч')).toBeVisible();

    await page.getByLabel('Отбой', { exact: true }).fill('00:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Среднее за 7 дней: 7 ч')).toBeVisible();
    await expect(page.getByRole('img', { name: /записей 1/ })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Given модуль health When я открываю /health Then только сон; дневник еды — в /nutrition, журнал тренировок — в /training', async ({
    page,
  }) => {
    await page.goto('/#/health');
    await expect(page.getByRole('heading', { name: 'Сон', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Разделы' })).toHaveCount(0);
    await page.goto('/#/training');
    await expect(page.getByText('Новая тренировка')).toBeVisible();
    await page.goto('/#/nutrition');
    await expect(page.getByRole('region', { name: 'Итого за день' })).toBeVisible();
    // Old tab links lead to the new blocks.
    await page.goto('/#/health/workouts');
    await expect(page).toHaveURL(/#\/training$/);
  });

  test('workouts: log one with an exercise, repeat it, see the week totals', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T19:00:00'));
    await page.goto('/#/training');
    await expect(page.getByText('За последние 60 дней тренировок нет — запишите первую')).toBeVisible();

    await page.getByLabel('Тип').selectOption('Силовая');
    await page.getByLabel('Длительность, мин').fill('60');
    await page.getByLabel('RPE (1–10)').selectOption('8');
    await page.getByRole('button', { name: '+ Упражнение' }).click();
    await page.getByLabel('Упражнение 1: название').fill('Присед');
    const remove = await page.getByRole('button', { name: 'Удалить упражнение 1' }).boundingBox();
    expect(remove?.width).toBeGreaterThanOrEqual(44);
    await page.getByLabel('Упражнение 1, подход 1: повторы').fill('5');
    await page.getByLabel('Упражнение 1, подход 1: вес, кг').fill('100');
    await page.getByRole('button', { name: 'Сохранить тренировку' }).click();

    const history = page.getByRole('list', { name: 'История тренировок' });
    await expect(history.getByText('Присед: 5 × 100 кг')).toBeVisible();

    await history.getByRole('button', { name: /^Повторить/ }).click();
    await expect(page.getByLabel('Упражнение 1: название')).toHaveValue('Присед');
    await page.getByRole('button', { name: 'Сохранить тренировку' }).click();
    await expect(history.getByRole('listitem', { name: /Силовая/ })).toHaveCount(2);

    await expect(page.getByText('Минуты').locator('xpath=following-sibling::dd[1]')).toHaveText('120');
    await expect(page.getByText('Средний RPE').locator('xpath=following-sibling::dd[1]')).toHaveText('8');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('adaptation: short sleep shows the gap to the goal and a soft warning for a hard workout', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await page.getByLabel('Отбой', { exact: true }).fill('02:00');
    await page.getByLabel('Подъём', { exact: true }).fill('07:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Прошлая ночь: 5 ч')).toBeVisible();
    await expect(page.getByText('(−2,5 ч)')).toBeVisible();

    await page.goto('/#/training');
    await page.getByLabel('RPE (1–10)').selectOption('7');
    const warning = page.getByRole('note', { name: 'Предупреждение об интенсивности' });
    await expect(warning).toContainText('RPE до 4');
    await expect(warning).toContainText('тренировка не выше лёгкой');
  });

  test('food diary: create a product, add 150 g to lunch, see totals, re-add from recent', async ({ page }) => {
    await page.route(OFF_ROUTE, (route) => route.fulfill({ json: { products: [] } }));
    await page.clock.setFixedTime(new Date('2026-11-04T13:00:00+05:00'));
    await page.goto('/#/nutrition');
    await expect(page.getByText(/Кофеин — до/)).toBeVisible();

    await page.getByRole('button', { name: '+ Добавить в «Обед»' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Поиск продукта').fill('Хлеб');
    await dialog.getByRole('button', { name: 'Создать свой продукт' }).click();
    await dialog.getByLabel('Ккал').fill('250');
    await dialog.getByLabel('Белки, г').fill('10');
    await dialog.getByLabel('Жиры, г').fill('5');
    await dialog.getByLabel('Углеводы, г').fill('40');
    await dialog.getByRole('button', { name: 'Создать продукт' }).click();
    await dialog.getByLabel('Вес, г').fill('150');
    await dialog.getByRole('button', { name: 'Добавить' }).click();

    const lunch = page.getByRole('region', { name: 'Обед' });
    await expect(lunch).toContainText('Итого: 375 ккал · Б 15 · Ж 7,5 · У 60');

    await page.getByRole('button', { name: '+ Добавить в «Ужин»' }).click();
    await page.getByRole('region', { name: 'Недавние продукты' }).getByRole('button', { name: 'Хлеб' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Добавить' }).click();
    await expect(page.getByRole('region', { name: 'Итого за день' })).toContainText('625 ккал');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('food search: own foods first, then Open Food Facts; a picked product works offline', async ({
    page,
    context,
  }) => {
    await page.route(OFF_ROUTE, (route) =>
      route.fulfill({
        json: {
          products: [
            {
              code: '4600000000001',
              product_name_ru: 'Гречка ядрица',
              nutriments: { 'energy-kcal_100g': 313, proteins_100g: 12.6, fat_100g: 3.3, carbohydrates_100g: 57.1 },
            },
            { code: '4600000000002', product_name_ru: 'Гречка без калорий', nutriments: {} },
            {
              code: '4600000000003',
              product_name_ru:
                'Гречневые хлопья быстрого приготовления 5х40г/пакетики_без_пробелов_очень_длинное_название',
              nutriments: { 'energy-kcal_100g': 330 },
            },
          ],
        },
      }),
    );
    await page.goto('/#/nutrition');
    await page.getByRole('button', { name: '+ Добавить в «Обед»' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Поиск продукта').fill('гречка');
    const off = dialog.getByRole('list', { name: 'Результаты Open Food Facts' });
    await expect(off.getByRole('button')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await off.getByRole('button', { name: /Гречка ядрица/ }).click();
    await dialog.getByLabel('Вес, г').fill('80');
    await dialog.getByRole('button', { name: 'Добавить' }).click();
    await expect(page.getByRole('region', { name: 'Обед' })).toContainText('Гречка ядрица, 80 г');

    await context.setOffline(true);
    await page.getByRole('button', { name: '+ Добавить в «Ужин»' }).click();
    // A new query (results of «гречка» are already cached for this session).
    await dialog.getByLabel('Поиск продукта').fill('греч');
    await expect(
      dialog.getByRole('region', { name: 'Мои продукты' }).getByRole('button', { name: /Гречка ядрица/ }),
    ).toBeVisible();
    await expect(dialog.getByText(/Нет сети — поиск в Open Food Facts недоступен/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Создать свой продукт' })).toBeVisible();
    await context.setOffline(false);
  });

  test('food search: OFF rate-limit page without CORS says «не отвечает», not «нет сети»', async ({ page }) => {
    await page.route(OFF_ROUTE, (route) =>
      route.fulfill({ status: 503, contentType: 'text/html', body: 'Too many requests' }),
    );
    await page.goto('/#/nutrition');
    await page.getByRole('button', { name: '+ Добавить в «Обед»' }).click();
    await page.getByRole('dialog').getByLabel('Поиск продукта').fill('гречка');
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Open Food Facts сейчас не отвечает');
  });

  test('corrections: re-weigh and delete a meal item, delete a workout and a night of sleep', async ({ page }) => {
    await page.route(OFF_ROUTE, (route) => route.fulfill({ json: { products: [] } }));
    await page.clock.setFixedTime(new Date('2026-11-04T19:00:00+05:00'));

    // Sleep: log last night, then delete it.
    await page.goto('/#/health');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByRole('img', { name: /записей 1/ })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить запись за 4 ноября' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText('Записей пока нет')).toBeVisible();

    // Food: add 100 g of a product, change it to 150 g, then delete it.
    await page.goto('/#/nutrition');
    await page.getByRole('button', { name: '+ Добавить в «Обед»' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Поиск продукта').fill('Хлеб');
    await dialog.getByRole('button', { name: 'Создать свой продукт' }).click();
    await dialog.getByLabel('Ккал').fill('250');
    await dialog.getByLabel('Белки, г').fill('10');
    await dialog.getByLabel('Жиры, г').fill('5');
    await dialog.getByLabel('Углеводы, г').fill('40');
    await dialog.getByRole('button', { name: 'Создать продукт' }).click();
    await dialog.getByRole('button', { name: 'Добавить' }).click();
    const lunch = page.getByRole('region', { name: 'Обед' });
    const item = lunch.getByRole('button', { name: 'Изменить: Хлеб, 100 г' });
    expect((await item.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await item.click();
    await dialog.getByLabel('Вес, г').fill('150');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(lunch).toContainText('Итого: 375 ккал · Б 15 · Ж 7,5 · У 60');
    await lunch.getByRole('button', { name: 'Изменить: Хлеб, 150 г' }).click();
    await dialog.getByRole('button', { name: 'Удалить' }).click();
    await dialog.getByRole('button', { name: 'Удалить' }).click();
    await expect(lunch).toContainText('Пока пусто');
    await expect(page.getByRole('region', { name: 'Итого за день' })).toContainText('0 ккал');

    // Workouts: log one, then delete it.
    await page.goto('/#/training');
    await page.getByLabel('Тип').selectOption('Бег');
    await page.getByLabel('Длительность, мин').fill('30');
    await page.getByLabel('RPE (1–10)').selectOption('5');
    await page.getByRole('button', { name: 'Сохранить тренировку' }).click();
    const remove = page.getByRole('button', { name: 'Удалить: Бег, 4 ноября' });
    expect((await remove.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    await remove.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText('За последние 60 дней тренировок нет — запишите первую')).toBeVisible();
    await expect(page.getByText('Минуты').locator('xpath=following-sibling::dd[1]')).toHaveText('0');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('alarm', () => {
  test('Given веб When я открываю карточку будильника Then «доступно в приложении для телефона»', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await expect(page.getByText(/Будильник доступен в приложении для телефона/)).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Будильник' })).toHaveCount(0);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('health store import', () => {
  test('Given веб When я открываю настройки импорта Then «доступно в приложении для телефона»', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await expect(page.getByText('Импорт сна и тренировок доступен в приложении для телефона.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Подключить' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сохранить сон' })).toBeVisible();
  });
});

test.describe('privacy policy', () => {
  test('Given окно разрешений Health Connect When я нажимаю «Политика конфиденциальности» Then открывается текст политики LifeOS на русском', async ({
    page,
  }) => {
    // Health Connect opens the same page from the app's assets (`public/privacy/index.html` in the build).
    await page.goto('/privacy/');
    await expect(page.getByRole('heading', { name: 'Политика конфиденциальности LifeOS', level: 1 })).toBeVisible();
    await expect(page.getByText(/только сон и тренировки/)).toBeVisible();
    await expect(page.getByText(/только на этом устройстве/i)).toBeVisible();
    await expect(page.getByText('almasakhmediyar@gmail.com').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'LifeOS privacy policy' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('night sensing', () => {
  test('Given веб When я открываю блок Then объяснение про трекинг сна по датчикам и ручной ввод как раньше', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await expect(page.getByText(/Трекинг сна по датчикам работает только в приложении для Android/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Спать' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сохранить сон' })).toBeVisible();
  });
});

test.describe('sleep stages', () => {
  test('Given ночь с stages When я открываю «Сон» Then у записи видна сводка этапов и полоса этапов по времени', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T08:00:00'));
    await page.goto('/#/health');
    await expect(page.getByRole('heading', { name: 'Сон', level: 1 })).toBeVisible();
    // A night recorded with stages (as «Я встал» saves it on a phone).
    await page.evaluate(async () => {
      const bed = new Date(2026, 10, 7, 23, 30).getTime();
      const wake = new Date(2026, 10, 8, 7, 0).getTime();
      const M = 60_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('lifeos');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('sleepLogs', 'readwrite');
        tx.objectStore('sleepLogs').put({
          id: 'night-1',
          createdAt: 1,
          updatedAt: 1,
          date: '2026-11-08',
          bedtime: bed,
          wakeTime: wake,
          quality: 4,
          stages: [
            { start: bed, end: bed + 300 * M, stage: 'deep' },
            { start: bed + 300 * M, end: wake, stage: 'light' },
          ],
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.reload();
    const card = page.getByRole('region', { name: 'Этапы прошлой ночи' });
    await expect(card).toContainText('Глубокий сон 5 ч 0 мин · лёгкий 2 ч 30 мин');
    await expect(card.getByRole('img', { name: /Этапы сна с 23:30 до 7:00/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
