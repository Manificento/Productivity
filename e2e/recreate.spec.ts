import { expect, test, type Page } from '@playwright/test';

/**
 * #294: a record of a day is deleted and entered again. Deletion leaves a tombstone (#274); a one-per-day record
 * keeps its id (#275), so the new entry replaces the tombstone — the user sees exactly one record, also after a
 * reload.
 */

/** Every row of an IndexedDB store as stored, tombstones included (reads through the app hide them). */
function storedRows(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      if (!db.objectStoreNames.contains(name)) return [];
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }, store);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('delete a day record and create it again', () => {
  // FIXME(#309): the «Вес» card has no way to delete a day's entry yet. The scenario is written against the
  // labels #309 specifies; remove `fixme` when #309 is done — it must pass unchanged.
  test.fixme('Given записан вес за сегодня When я удаляю запись и ввожу вес снова Then на экране одна запись с новым значением; после перезагрузки страницы она на месте', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/nutrition');
    await page.getByLabel('Вес, кг').fill('72,4');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByText('Записано: 72,4 кг')).toBeVisible();

    await page.getByRole('button', { name: 'Удалить вес за 4 ноября' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText(/Записей веса пока нет/)).toBeVisible();

    await page.getByLabel('Вес, кг').fill('71,8');
    await page.getByRole('button', { name: 'Записать' }).click();
    const chart = page.getByRole('img', { name: /Вес: записей 1/ });
    await expect(chart).toContainText('2026-11-04: 71,8 кг');
    await expect(chart).not.toContainText('72,4');

    // The new entry took the tombstone's place under the same id: one stored row, live, with the new value.
    await expect
      .poll(async () =>
        (await storedRows(page, 'weightLogs')).map((r) => ({ id: r.id, kg: r.kg, deleted: r.deletedAt != null })),
      )
      .toEqual([{ id: 'weight:2026-11-04', kg: 71.8, deleted: false }]);

    await page.reload();
    await expect(page.getByRole('img', { name: /Вес: записей 1/ })).toContainText('2026-11-04: 71,8 кг');
    await expectNoHorizontalScroll(page);
  });

  test('Given записан сон за прошлую ночь When я удаляю запись и добавляю сон за ту же ночь Then на экране одна запись с новым значением; после перезагрузки она на месте', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await expect(page.getByRole('heading', { name: 'Сон', level: 1 })).toBeVisible();
    await page.getByLabel('Отбой', { exact: true }).fill('23:30');
    await page.getByLabel('Подъём', { exact: true }).fill('07:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Сохранено: 7,5 ч')).toBeVisible();
    await expect(page.getByRole('img', { name: /записей 1/ })).toBeVisible();

    await page.getByRole('button', { name: 'Удалить запись за 4 ноября' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText('Записей пока нет')).toBeVisible();

    await page.getByLabel('Отбой', { exact: true }).fill('00:00');
    await page.getByLabel('Подъём', { exact: true }).fill('07:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Сохранено: 7 ч')).toBeVisible();
    const chart = page.getByRole('img', { name: 'Длительность сна за 14 дней: записей 1, среднее за 7 дней 7 ч' });
    await expect(chart).toContainText('2026-11-04: 7 ч');
    await expect(page.getByText('Прошлая ночь: 7 ч')).toBeVisible();

    // The night took the tombstone's place under the same id: one stored row, live, with the new times.
    await expect
      .poll(async () =>
        (await storedRows(page, 'sleepLogs')).map((r) => ({
          id: r.id,
          hours: (Number(r.wakeTime) - Number(r.bedtime)) / 3_600_000,
          deleted: r.deletedAt != null,
        })),
      )
      .toEqual([{ id: 'sleep:2026-11-04', hours: 7, deleted: false }]);

    await page.reload();
    await expect(
      page.getByRole('img', { name: 'Длительность сна за 14 дней: записей 1, среднее за 7 дней 7 ч' }),
    ).toContainText('2026-11-04: 7 ч');
    await expect(page.getByText('Прошлая ночь: 7 ч')).toBeVisible();
    await expect(page.getByText('Среднее за 7 дней: 7 ч')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('Given запланирована тренировка на дату When я удаляю её и планирую на ту же дату снова Then в плане одна тренировка', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00')); // Wednesday
    await page.goto('/#/training');
    await page.getByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }).click();
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    const plan = page.getByRole('list', { name: 'План на 2 недели' });
    // Friday 6 November is a session day of the template.
    const friday = plan.getByRole('listitem', { name: 'пт, 6 ноября', exact: true });
    await expect(friday).toBeVisible();
    const exercises = (await friday.locator('p').nth(1).textContent()) ?? '';
    expect(exercises).not.toBe('');

    // Deleting: archiving the program removes its future sessions from the plan.
    await page.getByRole('button', { name: 'Архивировать Сила 3 раза в неделю' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Архивировать' }).click();
    await expect(page.getByText(/Программ пока нет/)).toBeVisible();
    await expect(plan).toHaveCount(0);

    // Planning the same date again.
    await page.getByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }).click();
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(friday).toHaveCount(1);
    await expect(friday).toHaveText(`пт, 6 ноября${exercises}`);
    await expect(page.getByRole('list', { name: 'Программы' }).getByRole('listitem')).toHaveCount(1);

    // Stored: one live session on that date (of the new program), the deleted one is a tombstone.
    const onFriday = async () => {
      const [sessions, programs] = await Promise.all([
        storedRows(page, 'plannedSessions'),
        storedRows(page, 'programs'),
      ]);
      const active = new Set(programs.filter((p) => p.deletedAt == null && !p.archived).map((p) => p.id));
      const live = sessions.filter((s) => s.deletedAt == null && s.date === '2026-11-06');
      return {
        live: live.length,
        ofActiveProgram: live.filter((s) => active.has(s.programId)).length,
        hasTombstones: sessions.some((s) => s.deletedAt != null),
      };
    };
    await expect.poll(onFriday).toEqual({ live: 1, ofActiveProgram: 1, hasTombstones: true });

    await page.reload();
    await expect(
      page.getByRole('list', { name: 'План на 2 недели' }).getByRole('listitem', { name: 'пт, 6 ноября', exact: true }),
    ).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  });
});
