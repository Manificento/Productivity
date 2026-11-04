import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { Task } from '../../../core/types';
import { createDefaultCategories, listCategories, startCategoryTimer } from '../data/timeStore';
import { PomodoroView } from './PomodoroView';
import { usePomodoro } from './usePomodoro';

function Pomodoro() {
  return <PomodoroView pomodoro={usePomodoro()} />;
}

const MIN = 60_000;
const NOW = atLocalTime('2026-11-02', '09:00');

const task = (title: string, over: Partial<Task> = {}) =>
  newRecord({ title, priority: 2 as const, tags: [], ...over }, NOW - 1000);

/** The user leaves the tab and comes back `minutes` later. */
function returnAfter(minutes: number) {
  vi.setSystemTime(Date.now() + minutes * MIN);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function startFocus(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Начать фокус' }));
  await screen.findByText(/^Фокус · сессия/);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  await Promise.all([db.timeCategories.clear(), db.timeEntries.clear(), db.tasks.clear()]);
  await createDefaultCategories(NOW - 10_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PomodoroView', () => {
  it('настройки по умолчанию: при запуске идёт 25 мин работы, затем 5 мин отдыха', async () => {
    const user = userEvent.setup();
    render(<Pomodoro />);
    const timer = await screen.findByRole('timer', { name: 'Pomodoro' });
    expect(within(timer).getByText('25:00')).toBeInTheDocument();

    await startFocus(user);
    expect(within(timer).getByText('Фокус · сессия 1 из 4')).toBeInTheDocument();

    returnAfter(25);
    expect(await within(timer).findByText('Перерыв · сессия 1 из 4')).toBeInTheDocument();
    expect(within(timer).getByText('05:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Пропустить перерыв' })).toBeInTheDocument();

    returnAfter(5);
    expect(await within(timer).findByText('Готово к фокусу · сессия 2 из 4')).toBeInTheDocument();
  });

  it('выбрана невыполненная задача: по завершении фокус-сессии создан TimeEntry с source pomodoro и taskId', async () => {
    const open = task('Эссе по истории');
    await db.tasks.bulkAdd([open, task('Сдано', { completedAt: NOW - 5000 })]);
    const user = userEvent.setup();
    render(<Pomodoro />);

    const taskSelect = await screen.findByLabelText('Задача');
    expect(within(taskSelect).queryByRole('option', { name: 'Сдано' })).not.toBeInTheDocument();
    await user.selectOptions(taskSelect, 'Эссе по истории');
    await user.selectOptions(screen.getByLabelText('Категория'), 'Работа');
    await startFocus(user);
    expect(screen.getByText('Эссе по истории')).toBeInTheDocument();

    returnAfter(25);
    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1));
    const work = (await listCategories()).find((c) => c.name === 'Работа');
    expect((await db.timeEntries.toArray())[0]).toMatchObject({
      source: 'pomodoro',
      taskId: open.id,
      categoryId: work?.id,
      start: NOW,
      end: NOW + 25 * MIN,
      date: '2026-11-02',
    });
  });

  it('вкладка была в фоне 10 минут: при возврате оставшееся время верное', async () => {
    const user = userEvent.setup();
    render(<Pomodoro />);
    await startFocus(user);

    returnAfter(10);
    const timer = screen.getByRole('timer', { name: 'Pomodoro' });
    expect(await within(timer).findByText('15:00')).toBeInTheDocument();
  });

  it('таймер переживает перезагрузку страницы', async () => {
    const user = userEvent.setup();
    const first = render(<Pomodoro />);
    await startFocus(user);
    first.unmount();

    vi.setSystemTime(NOW + 7 * MIN);
    render(<Pomodoro />);
    const timer = await screen.findByRole('timer', { name: 'Pomodoro' });
    expect(within(timer).getByText('18:00')).toBeInTheDocument();
  });

  it('меняю длительности: после сохранения значения применяются со следующей сессии и сохраняются', async () => {
    const user = userEvent.setup();
    const first = render(<Pomodoro />);
    await startFocus(user);

    await user.click(screen.getByRole('button', { name: /^Длительности/ }));
    const dialog = screen.getByRole('dialog', { name: 'Настройки Pomodoro' });
    await user.clear(within(dialog).getByLabelText('Фокус, мин'));
    await user.type(within(dialog).getByLabelText('Фокус, мин'), '50');
    await user.clear(within(dialog).getByLabelText('Короткий перерыв, мин'));
    await user.type(within(dialog).getByLabelText('Короткий перерыв, мин'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    const timer = screen.getByRole('timer', { name: 'Pomodoro' });
    expect(within(timer).getByText('25:00')).toBeInTheDocument(); // current session unchanged
    returnAfter(25);
    expect(await within(timer).findByText('10:00')).toBeInTheDocument(); // the break uses the new value

    first.unmount();
    render(<Pomodoro />);
    expect(await screen.findByRole('button', { name: 'Длительности: 50 / 10 / 15 мин' })).toBeInTheDocument();
  });

  it('неверная длительность — ошибка у поля, настройки не меняются', async () => {
    const user = userEvent.setup();
    render(<Pomodoro />);
    await user.click(await screen.findByRole('button', { name: /^Длительности/ }));
    const dialog = screen.getByRole('dialog', { name: 'Настройки Pomodoro' });
    await user.clear(within(dialog).getByLabelText('Фокус, мин'));
    await user.type(within(dialog).getByLabelText('Фокус, мин'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Фокус: целое число от 1 до 180');
    expect(within(dialog).getByLabelText('Фокус, мин')).toHaveAttribute('aria-invalid', 'true');
  });

  it('сессия закончилась и уведомления разрешены: звучит сигнал и вибрация', async () => {
    const shown: string[] = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(_title: string, options?: { body?: string }) {
        shown.push(options?.body ?? '');
      }
    }
    vi.stubGlobal('Notification', FakeNotification);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });

    const user = userEvent.setup();
    render(<Pomodoro />);
    expect(screen.queryByRole('button', { name: /Разрешить уведомления/ })).not.toBeInTheDocument();
    await startFocus(user);
    expect(vibrate).not.toHaveBeenCalled();

    returnAfter(25);
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1));
    expect(shown).toEqual(['Фокус-сессия завершена — время отдохнуть']);
  });

  it('уведомления ещё не разрешены: предлагается их включить', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const user = userEvent.setup();
    render(<Pomodoro />);

    await user.click(await screen.findByRole('button', { name: 'Разрешить уведомления о конце сессии' }));
    expect(requestPermission).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Разрешить уведомления/ })).not.toBeInTheDocument(),
    );
  });

  it('запуск фокуса останавливает идущий таймер учёта, чтобы время не считалось дважды', async () => {
    const [study] = await listCategories();
    const id = await startCategoryTimer({ categoryId: study!.id, source: 'timer' }, NOW - 10 * MIN);
    const user = userEvent.setup();
    render(<Pomodoro />);
    await startFocus(user);
    expect((await db.timeEntries.get(id))?.end).toBe(NOW);
  });

  it('остановка фокуса раньше времени записывает прошедшие минуты', async () => {
    const user = userEvent.setup();
    render(<Pomodoro />);
    await startFocus(user);
    vi.setSystemTime(NOW + 12 * MIN);
    await user.click(screen.getByRole('button', { name: 'Остановить' }));

    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1));
    expect((await db.timeEntries.toArray())[0]).toMatchObject({ source: 'pomodoro', start: NOW, end: NOW + 12 * MIN });
    expect(await screen.findByRole('button', { name: 'Начать фокус' })).toBeInTheDocument();
  });

  it('категорий нет: предлагается добавить стартовый набор', async () => {
    await db.timeCategories.clear();
    const user = userEvent.setup();
    render(<Pomodoro />);
    await user.click(await screen.findByRole('button', { name: 'Добавить стартовый набор' }));
    expect(await screen.findByRole('button', { name: 'Начать фокус' })).toBeInTheDocument();
  });

  it('ошибка записи в базу: сообщение на русском, сессия не теряется и записывается при следующей попытке', async () => {
    const add = vi.spyOn(db.timeEntries, 'add').mockRejectedValue(new Error('disk full'));
    const user = userEvent.setup();
    render(<Pomodoro />);
    await startFocus(user);
    returnAfter(25);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось записать фокус-сессию');
    expect(screen.getByText(/^Фокус · сессия/)).toBeInTheDocument(); // state did not move on

    add.mockRestore();
    returnAfter(0);
    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1));
    expect(await screen.findByText(/^Перерыв · сессия/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('фаза закончилась давно (приложение было закрыто): запись создаётся, но сигнала нет', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const user = userEvent.setup();
    render(<Pomodoro />);
    await startFocus(user);

    returnAfter(40);
    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1));
    expect(await screen.findByText(/^Готово к фокусу/)).toBeInTheDocument();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('остановка с ошибкой записи оставляет таймер идти', async () => {
    const user = userEvent.setup();
    render(<Pomodoro />);
    await startFocus(user);
    const add = vi.spyOn(db.timeEntries, 'add').mockRejectedValue(new Error('disk full'));
    vi.setSystemTime(NOW + 5 * MIN);
    await user.click(screen.getByRole('button', { name: 'Остановить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось записать фокус-сессию');
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeInTheDocument();
    add.mockRestore();
  });

  it('другая вкладка остановила таймер: эта вкладка следует за ней', async () => {
    const user = userEvent.setup();
    render(<Pomodoro />);
    await startFocus(user);
    localStorage.setItem('lifeos.time.pomodoro.state', JSON.stringify({ status: 'idle', completedWork: 0 }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'lifeos.time.pomodoro.state' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    });
    expect(await screen.findByRole('button', { name: 'Начать фокус' })).toBeInTheDocument();
  });
});
