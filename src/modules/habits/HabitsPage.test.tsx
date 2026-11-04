import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import { atLocalTime } from '../../core/logging/sleepTime';
import type { HabitSchedule } from '../../core/types';
import { HabitsPage } from './HabitsPage';

function renderPage(path = '/habits') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/habits/*" element={<HabitsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const NOW = atLocalTime('2026-11-03', '08:00'); // Tuesday
const TODAY = '2026-11-03';

async function addHabit(name: string, schedule: HabitSchedule = { kind: 'daily' }, over = {}) {
  const h = newRecord(
    { name, schedule, archived: false, color: '#22c55e', ...over },
    atLocalTime('2026-10-01', '09:00'),
  );
  await db.habits.add(h);
  return h.id;
}

async function mark(habitId: string, date: string, done = true) {
  await db.habitLogs.add(newRecord({ habitId, date, done }, NOW - 1000));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all([db.habits.clear(), db.habitLogs.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HabitsPage', () => {
  it('Given привычка timesPerWeek уже выполнила недельную цель и не отмечена сегодня When открыт экран «Привычки» Then в «Не сегодня» рядом с ней написано «цель недели выполнена»', async () => {
    const gym = await addHabit('Зал', { kind: 'timesPerWeek', timesPerWeek: 1 });
    await addHabit('Бег', { kind: 'weekdays', weekdays: [1, 3, 5] });
    await mark(gym, '2026-11-02');
    renderPage();

    const card = (await screen.findByText('Не сегодня')).closest('section,div') as HTMLElement;
    const row = (await within(card).findByRole('link', { name: 'Открыть «Зал»' })).closest('li') as HTMLElement;
    expect(within(row).getByText('цель недели выполнена')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Открыть «Зал»' })).toHaveAccessibleDescription(
      'цель недели выполнена',
    );
    const other = within(card).getByRole('link', { name: 'Открыть «Бег»' });
    expect(other).not.toHaveTextContent('цель недели выполнена');
  });

  it('есть привычки, запланированные на сегодня: при открытии видны с крупной кнопкой-отметкой и серией 🔥N', async () => {
    const read = await addHabit('Чтение');
    await mark(read, '2026-11-01');
    await mark(read, '2026-11-02');
    await addHabit('Зал', { kind: 'weekdays', weekdays: [1, 3, 5] }); // not on Tuesday
    renderPage();

    const list = await screen.findByRole('list', { name: 'Привычки на сегодня' });
    const row = within(list).getByRole('listitem');
    expect(within(row).getByText('Чтение')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Отметить «Чтение»' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(row).getByText('🔥2')).toBeInTheDocument();
    expect(within(list).queryByText('Зал')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть «Зал»' })).toBeInTheDocument(); // under «Не сегодня»
  });

  it('привычка не отмечена: тап по отметке создаёт HabitLog с done: true, серия растёт', async () => {
    const read = await addHabit('Чтение');
    await mark(read, '2026-11-02');
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Отметить «Чтение»' }));

    expect(await screen.findByText('🔥2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Снять отметку «Чтение»' })).toHaveAttribute('aria-pressed', 'true');
    const logs = await db.habitLogs.where('[habitId+date]').equals([read, TODAY]).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.done).toBe(true);
  });

  it('привычка отмечена: повторный тап снимает отметку', async () => {
    const read = await addHabit('Чтение');
    await mark(read, '2026-11-02');
    await mark(read, TODAY);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Снять отметку «Чтение»' }));

    expect(await screen.findByRole('button', { name: 'Отметить «Чтение»' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('🔥1')).toBeInTheDocument();
    const logs = await db.habitLogs.where('[habitId+date]').equals([read, TODAY]).toArray();
    expect(logs.map((l) => l.done)).toEqual([false]);
  });

  it('редактор: название, расписание (каждый день / дни недели / N раз в неделю) и цвет сохраняются', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/Привычек пока нет/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Привычка' }));
    let dialog = screen.getByRole('dialog', { name: 'Новая привычка' });
    await user.type(within(dialog).getByLabelText('Название'), 'Бег');
    await user.click(within(dialog).getByRole('radio', { name: 'N раз в неделю' }));
    await user.clear(within(dialog).getByLabelText('Сколько раз в неделю'));
    await user.type(within(dialog).getByLabelText('Сколько раз в неделю'), '3');
    await user.click(within(dialog).getByRole('radio', { name: 'Цвет 4' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('button', { name: 'Отметить «Бег»' })).toBeInTheDocument();
    expect(screen.getByText('3 раза в неделю')).toBeInTheDocument();
    const [saved] = await db.habits.toArray();
    expect(saved).toMatchObject({ name: 'Бег', schedule: { kind: 'timesPerWeek', timesPerWeek: 3 }, color: '#f59e0b' });

    // change to weekdays Mon/Wed: today (Tue) is no longer planned
    await user.click(screen.getByRole('link', { name: 'Открыть «Бег»' }));
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    dialog = screen.getByRole('dialog', { name: 'Изменить привычку' });
    await user.click(within(dialog).getByRole('radio', { name: 'Дни недели' }));
    for (const d of ['Вт', 'Чт', 'Пт']) await user.click(within(dialog).getByRole('button', { name: d }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('пн, ср')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '← Все привычки' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Привычки на сегодня' })).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Открыть «Бег»' })).toBeInTheDocument();
    expect((await db.habits.get(saved!.id))?.schedule).toEqual({ kind: 'weekdays', weekdays: [1, 3] });
  });

  it('редактор: ошибки у полей — пустое название, нет дней недели', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Привычка' }));
    const dialog = screen.getByRole('dialog', { name: 'Новая привычка' });
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Введите название');

    await user.type(within(dialog).getByLabelText('Название'), 'Йога');
    await user.click(within(dialog).getByRole('radio', { name: 'Дни недели' }));
    for (const d of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт']) await user.click(within(dialog).getByRole('button', { name: d }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Выберите хотя бы один день');
    expect(await db.habits.count()).toBe(0);
  });

  it('архивные привычки не показываются в списке', async () => {
    await addHabit('Старое', { kind: 'daily' }, { archived: true });
    await addHabit('Чтение');
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'Отметить «Чтение»' });
    expect(screen.queryByText('Старое')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Открыть «Чтение»' }));
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'В архив' }));
    expect(await screen.findByText(/все в архиве/)).toBeInTheDocument();
  });

  it('ошибка записи: сообщение на русском', async () => {
    await addHabit('Чтение');
    const spy = vi.spyOn(db.habitLogs, 'add').mockRejectedValue(new Error('disk full'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Отметить «Чтение»' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить отметку');
    spy.mockRestore();
  });

  it('ошибка сохранения в редакторе: сообщение, окно остаётся открытым', async () => {
    const spy = vi.spyOn(db.habits, 'add').mockRejectedValue(new Error('disk full'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Привычка' }));
    const dialog = screen.getByRole('dialog', { name: 'Новая привычка' });
    await user.type(within(dialog).getByLabelText('Название'), 'Йога');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не удалось сохранить. Попробуйте ещё раз');
    expect(screen.getByRole('dialog', { name: 'Новая привычка' })).toBeInTheDocument();
    spy.mockRestore();
  });
});
