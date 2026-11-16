import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { applyAsyncTimeout } from '../../test/async';
import { TrainingPage } from './TrainingPage';

// The whole page with several live queries.
applyAsyncTimeout();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 23, 50)); // Wednesday, a training day of the template
  await Promise.all([db.programs.clear(), db.plannedSessions.clear(), db.workoutLogs.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TrainingPage', () => {
  it('Given страница открыта через полночь When наступает новый день Then «Сегодня» показывает новый день без перезагрузки', async () => {
    render(
      <MemoryRouter>
        <TrainingPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    expect(await screen.findByRole('list', { name: 'Сессия на сегодня' })).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 10, 5, 0, 0, 5)); // Thursday: no session
    act(() => {
      fireEvent.focus(window);
    });
    expect(await screen.findByText('День отдыха')).toBeInTheDocument();
    // The new day also marks Wednesday's session «пропущена» and carries its exercises on (#226), in the background:
    // wait for that write, or it lands in the next test (#292).
    await waitFor(async () =>
      expect(await db.plannedSessions.where('date').equals('2026-11-04').first()).toMatchObject({
        status: 'skipped',
        carriedOut: expect.any(Array),
      }),
    );
  });
});
