import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { todayModule } from '../index';
import { applyAsyncTimeout } from '../../../test/async';

// Full screens with live queries: wait up to the shared timeout, not the default 1 s (#169).
applyAsyncTimeout();

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Text of each body row's «Фокус» cell. */
function focusColumn(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').at(-1)!.textContent ?? '');
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0)); // 4 Nov 2026
  await db.lifeEvents.add({
    id: 'e1',
    title: 'IELTS',
    type: 'exam',
    date: '2026-11-09',
    importance: 3,
    prepDays: 7,
    createdAt: 0,
    updatedAt: 0,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([db.lifeEvents.clear(), db.settings.clear()]);
});

describe('Предпросмотр 10 дней', () => {
  it('Given событие через 5 дней When я открываю его Then вижу таблицу на 10 дней: фаза, ёмкость, сон, тренировка, фокус-сессии', async () => {
    renderAt('/today/events/e1');
    const table = await screen.findByRole('table', { name: 'План на 10 дней' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['День', 'Фаза', 'Задачи', 'Сон', 'Трен.', 'Фокус']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent('4 нояб.подгот.6 ч8 чумер.7');
    expect(rows[5]).toHaveTextContent('9 нояб.событие1,8 ч7,5 чотдых0');
  });

  it('Given предпросмотр 10 дней When событие открыто Then видны и новые поля: медитация, тренажёры ума, привычки, разгрузка', async () => {
    renderAt('/today/events/e1');
    const table = await screen.findByRole('table', { name: 'Режим на 10 дней' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['День', 'Медит.', 'Ум', 'Привычки', 'Разгр.']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent('4 нояб.фокус10 минвсе—');
    expect(rows[5]).toHaveTextContent('9 нояб.дыхание5 минключевыеда');
    expect(rows[6]).toHaveTextContent('10 нояб.тело10 минвсе—');
  });

  it('Given я меняю важность или дни подготовки в форме When значения меняются Then предпросмотр пересчитывается сразу, до сохранения', async () => {
    const user = userEvent.setup();
    renderAt('/today/events/e1');
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    const dialog = screen.getByRole('dialog', { name: 'Изменить событие' });
    // The plan loads the day data once; after that every change is recomputed at once.
    const table = await within(dialog).findByRole('table', { name: 'План на 10 дней' });
    expect(focusColumn(table).slice(0, 4)).toEqual(['7', '7', '7', '7']);

    await user.click(within(dialog).getByRole('radio', { name: 'Обычное' }));
    expect(focusColumn(table).slice(0, 4)).toEqual(['5', '5', '5', '5']);

    const prep = within(dialog).getByLabelText('Дней подготовки');
    await user.clear(prep);
    await user.type(prep, '2');
    const updated = await within(dialog).findByRole('table', { name: 'План на 10 дней' });
    expect(focusColumn(updated).slice(0, 4)).toEqual(['4', '4', '4', '5']);

    // Nothing is saved until «Сохранить».
    expect(await db.lifeEvents.get('e1')).toMatchObject({ importance: 3, prepDays: 7 });
  });

  it('Given форма события с планом на 10 дней When поле на миг становится неверным (стёрты «Дней подготовки») Then вместо таблицы подсказка, а после исправления таблица появляется сразу, без «Загрузка…» и нового запроса к БД', async () => {
    const user = userEvent.setup();
    renderAt('/today/events/e1');
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    const dialog = screen.getByRole('dialog', { name: 'Изменить событие' });
    await within(dialog).findByRole('table', { name: 'План на 10 дней' });

    const reads = vi.spyOn(db.lifeEvents, 'where');
    const prep = within(dialog).getByLabelText('Дней подготовки');
    await user.clear(prep);
    expect(within(dialog).queryByRole('table')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Укажите дату и дни подготовки, чтобы увидеть план.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Загрузка…')).not.toBeInTheDocument();

    await user.type(prep, '2');
    // No waiting: the data is still loaded, so the table is back at once.
    expect(within(dialog).getByRole('table', { name: 'План на 10 дней' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Загрузка…')).not.toBeInTheDocument();
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
  });

  it('shows a live plan while creating an event and a hint while the input is invalid', async () => {
    const user = userEvent.setup();
    renderAt('/today/events');
    await user.click(await screen.findByRole('button', { name: /Добавить событие/ }));
    const dialog = screen.getByRole('dialog', { name: 'Новое событие' });
    await user.clear(within(dialog).getByLabelText('Дата'));
    await user.type(within(dialog).getByLabelText('Дата'), '2026-11-08');
    const table = await within(dialog).findByRole('table', { name: 'План на 10 дней' });
    // Important by default: +2 sessions; IELTS (critical) drives the overlapping days with +3.
    expect(focusColumn(table)[0]).toBe('7');
    await user.click(within(dialog).getByRole('radio', { name: 'Критичное' }));
    await user.clear(within(dialog).getByLabelText('Дата'));
    await user.type(within(dialog).getByLabelText('Дата'), '2026-11-06');
    // The new critical event is nearer, so it drives today: 4 + 3 sessions, and its taper day shows 2.
    expect(focusColumn(await within(dialog).findByRole('table', { name: 'План на 10 дней' })).slice(0, 2)).toEqual([
      '7',
      '2',
    ]);

    await user.clear(within(dialog).getByLabelText('Дней подготовки'));
    expect(within(dialog).queryByRole('table')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Укажите дату и дни подготовки, чтобы увидеть план.')).toBeInTheDocument();
  });

  it('uses the day targets of the user: their baseline and the other stored events', async () => {
    await db.settings.put({ key: 'adaptation.baseline', value: { taskCapacityMin: 300 } });
    await db.lifeEvents.add({
      id: 'e2',
      title: 'Дедлайн',
      type: 'deadline',
      date: '2026-11-07',
      importance: 1,
      prepDays: 2,
      createdAt: 0,
      updatedAt: 0,
    });
    renderAt('/today/events/e2');
    const table = await screen.findByRole('table', { name: 'План на 10 дней' });
    const rows = within(table).getAllByRole('row').slice(1);
    // On the deadline day IELTS preparation still drives the day; the last day is a normal 5-hour day.
    expect(rows[3]).toHaveTextContent('7 нояб.подгот.');
    expect(focusColumn(table)[3]).toBe('7');
    expect(rows[9]).toHaveTextContent('13 нояб.обычный5 ч');
  });

  it('says so in one line when the event does not change the next 10 days', async () => {
    await db.lifeEvents.put({
      id: 'e1',
      title: 'IELTS',
      type: 'exam',
      date: '2026-12-20',
      importance: 3,
      prepDays: 7,
      createdAt: 0,
      updatedAt: 0,
    });
    renderAt('/today/events/e1');
    expect(await screen.findByText('Ближайшие 10 дней идут в обычном режиме.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
