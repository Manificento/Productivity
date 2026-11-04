import { act, fireEvent, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { findSection, NOW, renderTasks, section, seedTask, setupTasksTestEnv, TODAY } from '../testing';
import { useToday } from './useToday';

setupTasksTestEnv();

const YESTERDAY_9 = new Date(2026, 10, 3, 9, 0).getTime();
const YESTERDAY_21 = new Date(2026, 10, 3, 21, 0).getTime();
const WEEK_AGO = new Date(2026, 9, 28, 10, 0).getTime();

describe('archive of completed tasks', () => {
  it('Given задачи, выполненные вчера и неделю назад When я открываю архив выполненных Then вижу их, сгруппированными по дню выполнения, новые сверху', async () => {
    const user = userEvent.setup();
    await seedTask('Неделю назад', { completedAt: WEEK_AGO });
    await seedTask('Вчера утром', { completedAt: YESTERDAY_9 });
    await seedTask('Вчера вечером', { completedAt: YESTERDAY_21 });
    await seedTask('Открытая', { dueDate: TODAY });
    renderTasks('/tasks');

    await user.click(screen.getByRole('link', { name: 'Выполнено' }));

    const regions = await screen.findAllByRole('region');
    expect(regions.map((r) => within(r).getByRole('heading').textContent)).toEqual([
      'Вчера · вт, 3 нояб.',
      'ср, 28 окт.',
    ]);
    const titles = within(regions[0])
      .getAllByRole('checkbox')
      .map((c) => c.getAttribute('aria-label'));
    expect(titles).toEqual(['Выполнено: Вчера вечером', 'Выполнено: Вчера утром']);
    expect(screen.queryByText('Открытая')).not.toBeInTheDocument();
  });

  it('Given задача в архиве When я снимаю отметку Then completedAt очищается и задача возвращается в активные списки', async () => {
    const user = userEvent.setup();
    const task = await seedTask('Неделю назад', { completedAt: WEEK_AGO, dueDate: '2026-10-28' });
    renderTasks('/tasks/done');

    await user.click(await screen.findByRole('checkbox', { name: 'Выполнено: Неделю назад' }));

    expect(await screen.findByText('Выполненных задач пока нет')).toBeInTheDocument();
    expect((await db.tasks.get(task.id))?.completedAt).toBeUndefined();
    await user.click(screen.getByRole('link', { name: 'Сегодня' }));
    expect(await within(await findSection('Сегодня')).findByText('Неделю назад')).toBeInTheDocument();
  });

  it('shows an empty archive', async () => {
    renderTasks('/tasks/done');
    expect(await screen.findByText('Выполненных задач пока нет')).toBeInTheDocument();
  });
});

describe('day change', () => {
  it('Given страница задач открыта до полуночи When наступает новый день Then «Выполнено сегодня» и списки по срокам пересчитываются без перезагрузки', async () => {
    await seedTask('Завтрашняя', { dueDate: '2026-11-05' });
    await seedTask('Сделана сегодня', { dueDate: TODAY, completedAt: NOW });
    renderTasks('/tasks');
    expect(within(await findSection('Выполнено сегодня')).getByText('Сделана сегодня')).toBeInTheDocument();
    expect(within(section('Сегодня')).queryByText('Завтрашняя')).not.toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 10, 5, 0, 0, 5));
    act(() => {
      fireEvent.focus(window);
    });

    expect(await within(section('Сегодня')).findByText('Завтрашняя')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Выполнено сегодня' })).not.toBeInTheDocument();
  });

  it('useToday re-arms its timer when the day did not change (clock moved back)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 23, 59, 0));
    const { result } = renderHook(() => useToday());
    act(() => {
      vi.setSystemTime(new Date(2026, 10, 4, 22, 0, 0)); // clock corrected backwards
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe(TODAY);
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60_000);
    });
    expect(result.current).toBe('2026-11-05');
  });

  it('useToday switches at local midnight by itself', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 23, 59, 0));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe(TODAY);

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe('2026-11-05');
  });
});
