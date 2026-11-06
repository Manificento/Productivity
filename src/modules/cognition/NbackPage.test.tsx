import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { NbackPage } from './NbackPage';
import { CognitionPage } from './CognitionPage';
import { saveNbackSession } from './data/mindSessions';

const day = (d: number) => new Date(2026, 10, d, 9).getTime();

async function seed(d: number, level: number, accuracyPct: number) {
  await saveNbackSession({ startedAt: day(d), durationMs: 180_000, level, accuracyPct, errors: 1 });
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cognition/*" element={<CognitionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.mindSessions.clear();
});
afterEach(() => vi.useRealTimers());

describe('n-back screen', () => {
  it('Given the module screen When I choose «n-back» Then the instruction is shown and the start level is n = 2', async () => {
    renderAt('/cognition');
    fireEvent.click(await screen.findByRole('link', { name: 'n-back' }));
    expect(await screen.findByText('Как проходить')).toBeInTheDocument();
    expect(screen.getByText(/тот же, что был/)).toBeInTheDocument();
    expect(screen.getByText(/Ваш уровень: n =/)).toHaveTextContent('n = 2');
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument();
  });

  it('Given accuracy ≥ 85% two sessions in a row When I start a new one Then n is increased', async () => {
    await seed(1, 2, 90);
    await seed(2, 2, 88);
    renderAt('/cognition/nback');
    expect(await screen.findByText(/Ваш уровень: n =/)).toHaveTextContent('n = 3');
  });

  it('Given accuracy ≤ 60% When I start a new session Then n is decreased', async () => {
    await seed(1, 3, 55);
    renderAt('/cognition/nback');
    expect(await screen.findByText(/Ваш уровень: n =/)).toHaveTextContent('n = 2');
  });

  it('Given a session When I answer Then the result is in mindSessions (kind nback, level, accuracy) and shown', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    renderAt('/cognition/nback?duration=10');
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    expect(screen.getAllByTestId('nback-cell').filter((c) => c.dataset.lit === 'true')).toHaveLength(1);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Совпало' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(await screen.findByText('Результат сохранён.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.mindSessions.count()).toBe(1));
    const row = await db.mindSessions.toCollection().first();
    expect(row).toMatchObject({ kind: 'nback', level: 2, date: '2026-11-04', durationMs: 10_000 });
    expect(row?.accuracyPct).toBeGreaterThanOrEqual(0);
    expect(screen.getByText(/^\d+%$/)).toBeInTheDocument();
  });
});

describe('n-back wiring', () => {
  it('a press on a matching trial is a hit with its reaction time; the saved level is the one at start', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    // 4 trials, n = 2: cells 0, 1, 0 (match at trial 2), 4.
    const values = [0, 0.12, 0.1, 0.9, 0.5];
    let k = 0;
    render(
      <MemoryRouter initialEntries={['/?duration=10']}>
        <NbackPage random={() => values[k++ % values.length]} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_200); // trial 2 began at 5 000 ms
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Совпало' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(await screen.findByText('Результат сохранён.')).toBeInTheDocument();
    const row = await db.mindSessions.toCollection().first();
    expect(row).toMatchObject({ kind: 'nback', level: 2, accuracyPct: 100, errors: 0, meanRtMs: 200 });
  });
});

describe('n-back summary', () => {
  it('Given an earlier n-back session at the same level When I finish Then the result is compared with my average and the next level is named', async () => {
    await seed(1, 2, 100);
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const values = [0, 0.12, 0.1, 0.9, 0.5]; // trial 2 is a match
    let k = 0;
    render(
      <MemoryRouter initialEntries={['/?duration=10']}>
        <NbackPage random={() => values[k++ % values.length]} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    // Nothing pressed: balanced accuracy 50% → 50 points below the earlier 100%.
    expect(
      await screen.findByText('На 50% хуже, чем личное среднее 100%. Следующая сессия — легче: n = 1.'),
    ).toBeInTheDocument();
  });
});

describe('n-back history', () => {
  it('Given the history When I open it Then a chart of level and accuracy by day is shown', async () => {
    await seed(2, 2, 80);
    await seed(4, 3, 90);
    renderAt('/cognition');
    expect(
      await screen.findByRole('img', { name: /Уровень и точность n-back по дням: последний уровень 3, точность 90%/ }),
    ).toBeInTheDocument();
  });

  it('with no sessions the history explains how to get one', async () => {
    renderAt('/cognition');
    expect(await screen.findByText(/Пока нет сессий/)).toBeInTheDocument();
  });
});
