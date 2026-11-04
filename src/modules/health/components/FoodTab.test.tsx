import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { addMealItem, createFood } from '../data/food';
import { FoodTab } from './FoodTab';

const TODAY = '2026-11-04';
const bread = { name: 'Хлеб', kcal: 250, protein: 10, fat: 5, carbs: 40 };

function renderTab() {
  render(
    <MemoryRouter>
      <FoodTab today={TODAY} />
    </MemoryRouter>,
  );
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const meal = (name: string) => screen.findByRole('region', { name });

async function openAdd(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: `+ Добавить в «${label}»` }));
  return screen.getByRole('dialog');
}

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.mealLogs.clear(), db.settings.clear(), db.lifeEvents.clear()]);
  // No real network in tests: Open Food Facts finds nothing here (searching is covered in FoodSearch.test.tsx).
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ products: [] }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('food tab', () => {
  it('Given a food of 250 kcal, P 10, F 5, C 40 per 100 g When I add 150 g to lunch Then lunch shows 375 kcal, P 15, F 7,5, C 60', async () => {
    await createFood(bread);
    renderTab();
    const dialog = await openAdd('Обед');
    type('Поиск продукта', 'хле');
    fireEvent.click(within(dialog).getByRole('button', { name: /Хлеб/ }));
    type('Вес, г', '150');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));

    const lunch = await meal('Обед');
    expect(await within(lunch).findByText('Хлеб, 150 г')).toBeInTheDocument();
    expect(lunch).toHaveTextContent('Итого: 375 ккал · Б 15 · Ж 7,5 · У 60');
  });

  it('Given meals of the day When the screen opens Then totals per meal and for the day are shown', async () => {
    const b = await createFood(bread);
    const apple = await createFood({ name: 'Яблоко', kcal: 50, protein: 0, fat: 0, carbs: 12 });
    await addMealItem(TODAY, 'breakfast', { foodId: apple.id, grams: 200 });
    await addMealItem(TODAY, 'lunch', { foodId: b.id, grams: 100 });
    await addMealItem('2026-11-03', 'lunch', { foodId: b.id, grams: 999 }); // other day
    renderTab();

    expect(await meal('Завтрак')).toHaveTextContent('Итого: 100 ккал · Б 0 · Ж 0 · У 24');
    expect(await meal('Обед')).toHaveTextContent('Итого: 250 ккал · Б 10 · Ж 5 · У 40');
    expect(await meal('Ужин')).toHaveTextContent('Пока пусто');
    expect(await meal('Итого за день')).toHaveTextContent('350 ккал · Б 10 · Ж 5 · У 64');
  });

  it('Given I create my own food When I enter a name and macros per 100 g Then it appears in search; negative values are an error', async () => {
    renderTab();
    const dialog = await openAdd('Ужин');
    type('Поиск продукта', 'Сырники');
    expect(within(dialog).getByText('Среди ваших продуктов ничего нет.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать свой продукт' }));

    expect(screen.getByLabelText('Название')).toHaveValue('Сырники');
    type('Ккал', '220');
    type('Белки, г', '-1');
    type('Жиры, г', '9');
    type('Углеводы, г', '20');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать продукт' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('КБЖУ не могут быть отрицательными');
    expect(await db.foods.count()).toBe(0);

    type('Белки, г', '15');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать продукт' }));
    // Created and picked right away: the grams step is shown.
    expect(await within(dialog).findByLabelText('Вес, г')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Назад' }));
    type('Поиск продукта', 'сыр');
    expect(within(dialog).getByRole('button', { name: /Сырники/ })).toBeInTheDocument();
  });

  it('Given recent foods When I add a meal Then the last 10 foods are one tap away', async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 11; i++) ids.push((await createFood({ ...bread, name: `Продукт ${i}` })).id);
    for (let i = 0; i < 11; i++) await addMealItem(TODAY, 'snack', { foodId: ids[i], grams: 10 }, i + 1);
    renderTab();
    const dialog = await openAdd('Завтрак');
    const recent = within(dialog).getByRole('region', { name: 'Недавние продукты' });
    const chips = within(recent).getAllByRole('button');
    expect(chips).toHaveLength(10);
    expect(chips[0]).toHaveTextContent('Продукт 11');
    expect(within(recent).queryByRole('button', { name: 'Продукт 1' })).not.toBeInTheDocument();

    fireEvent.click(chips[0]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await within(await meal('Завтрак')).findByText('Продукт 11, 100 г')).toBeInTheDocument();
  });

  it('Given noNewFoods = true When I add a food that was never logged Then a soft warning «Перед событием лучше без новых продуктов» is shown', async () => {
    // Exam tomorrow → today is the taper day with noNewFoods.
    await db.lifeEvents.put({
      id: 'exam',
      createdAt: 0,
      updatedAt: 0,
      title: 'Экзамен',
      type: 'exam',
      date: '2026-11-05',
      importance: 3,
      prepDays: 7,
    });
    const known = await createFood({ ...bread, name: 'Овсянка' });
    await addMealItem('2026-10-01', 'breakfast', { foodId: known.id, grams: 50 });
    await createFood({ ...bread, name: 'Манго' });
    renderTab();

    const dialog = await openAdd('Обед');
    type('Поиск продукта', 'манго');
    fireEvent.click(within(dialog).getByRole('button', { name: /Манго/ }));
    expect(await within(dialog).findByRole('note')).toHaveTextContent('Перед событием лучше без новых продуктов');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Назад' }));
    type('Поиск продукта', 'овся');
    fireEvent.click(within(dialog).getByRole('button', { name: /Овсянка/ }));
    // «Добавить» is enabled only once we know whether the food is new.
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Добавить' })).toBeEnabled());
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument();

    // Soft: adding still works.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await within(await meal('Обед')).findByText('Овсянка, 100 г')).toBeInTheDocument();
  });

  it('without noNewFoods a never-logged food gets no warning', async () => {
    await createFood({ ...bread, name: 'Манго' });
    renderTab();
    const dialog = await openAdd('Обед');
    type('Поиск продукта', 'манго');
    fireEvent.click(within(dialog).getByRole('button', { name: /Манго/ }));
    await within(dialog).findByLabelText('Вес, г');
    expect(within(dialog).getByRole('button', { name: 'Добавить' })).toBeEnabled();
    // The «new food» lookup resolves within milliseconds; the warning must not show up after it.
    await expect(within(dialog).findByRole('note', undefined, { timeout: 300 })).rejects.toThrow();
  });

  it('Given caffeineCutoff = 14:00 When the food diary is open Then the caffeine cutoff from the day targets is shown', async () => {
    await db.settings.put({ key: 'adaptation.baseline', value: { caffeineCutoff: '14:00' } });
    renderTab();
    expect(await screen.findByText(/Кофеин — до/)).toHaveTextContent('Кофеин — до 14:00');
  });

  it('a zero weight is an error and adds nothing', async () => {
    await createFood(bread);
    renderTab();
    const dialog = await openAdd('Обед');
    type('Поиск продукта', 'хлеб');
    fireEvent.click(within(dialog).getByRole('button', { name: /Хлеб/ }));
    type('Вес, г', '0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Укажите вес в граммах');
    expect(await db.mealLogs.count()).toBe(0);
  });

  it('Given a meal item When I delete it (with confirmation) Then it disappears and the meal and day totals are recalculated', async () => {
    const b = await createFood(bread);
    await addMealItem(TODAY, 'lunch', { foodId: b.id, grams: 100 });
    await addMealItem(TODAY, 'lunch', { foodId: b.id, grams: 50 });
    renderTab();
    const lunch = await meal('Обед');
    expect(await meal('Итого за день')).toHaveTextContent('375 ккал');

    fireEvent.click(await within(lunch).findByRole('button', { name: 'Изменить: Хлеб, 50 г' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    // Nothing is removed until the deletion is confirmed.
    expect(screen.getByRole('dialog')).toHaveTextContent('Удалить «Хлеб, 50 г» из «Обед»?');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(within(lunch).queryByText('Хлеб, 50 г')).not.toBeInTheDocument());
    expect(lunch).toHaveTextContent('Хлеб, 100 г');
    expect(lunch).toHaveTextContent('Итого: 250 ккал · Б 10 · Ж 5 · У 40');
    expect(await meal('Итого за день')).toHaveTextContent('250 ккал · Б 10 · Ж 5 · У 40');
  });

  it('Given a meal item When I delete the only item Then the meal is empty again', async () => {
    const b = await createFood(bread);
    await addMealItem(TODAY, 'dinner', { foodId: b.id, grams: 100 });
    renderTab();
    fireEvent.click(await within(await meal('Ужин')).findByRole('button', { name: 'Изменить: Хлеб, 100 г' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    expect(await within(await meal('Ужин')).findByText('Пока пусто')).toBeInTheDocument();
    expect(await meal('Итого за день')).toHaveTextContent('0 ккал');
  });

  it('Given a meal item When I change its weight Then the totals are recalculated', async () => {
    const b = await createFood(bread);
    await addMealItem(TODAY, 'lunch', { foodId: b.id, grams: 100 });
    renderTab();
    const lunch = await meal('Обед');
    fireEvent.click(await within(lunch).findByRole('button', { name: 'Изменить: Хлеб, 100 г' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Вес, г')).toHaveValue('100');

    type('Вес, г', '0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Укажите вес в граммах');

    type('Вес, г', '150');
    expect(dialog).toHaveTextContent('375 ккал');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await within(lunch).findByText('Хлеб, 150 г')).toBeInTheDocument();
    expect(lunch).toHaveTextContent('Итого: 375 ккал · Б 15 · Ж 7,5 · У 60');
    expect(await meal('Итого за день')).toHaveTextContent('375 ккал · Б 15 · Ж 7,5 · У 60');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a failed weight change shows an error and keeps the sheet open', async () => {
    const b = await createFood(bread);
    await addMealItem(TODAY, 'lunch', { foodId: b.id, grams: 100 });
    renderTab();
    fireEvent.click(await within(await meal('Обед')).findByRole('button', { name: 'Изменить: Хлеб, 100 г' }));
    const put = vi.spyOn(db.mealLogs, 'put').mockRejectedValueOnce(new Error('quota'));
    type('Вес, г', '120');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить — попробуйте ещё раз',
    );
    put.mockRestore();
  });

  it('an error of the weight form is not carried over to the delete confirmation', async () => {
    const b = await createFood(bread);
    await addMealItem(TODAY, 'lunch', { foodId: b.id, grams: 100 });
    renderTab();
    fireEvent.click(await within(await meal('Обед')).findByRole('button', { name: 'Изменить: Хлеб, 100 г' }));
    const dialog = screen.getByRole('dialog');
    type('Вес, г', '0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});
