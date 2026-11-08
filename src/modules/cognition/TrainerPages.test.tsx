import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { CognitionHome } from './CognitionHome';
import { savePvtResult } from './data/cognitiveTests';
import { saveNbackSession, saveSchulteSession, saveStroopSession } from './data/mindSessions';
import { SchultePage } from './SchultePage';
import { StroopPage } from './StroopPage';

const FAKE = ['performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] as const;
const at = (d: number) => new Date(2026, 10, d, 9).getTime();

beforeEach(async () => {
  await db.mindSessions.clear();
  await db.cognitiveTests.clear();
});
afterEach(() => vi.useRealTimers());

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function fakeClock() {
  vi.useFakeTimers({ toFake: [...FAKE] });
  vi.setSystemTime(new Date(2026, 10, 4, 9));
}

describe('Stroop', () => {
  it('Given «Струп» When I go through the session Then accuracy, mean time and interference are shown and saved in mindSessions', async () => {
    fakeClock();
    // trial 1: word «Синий» printed red (incongruent); trial 2: «Красный» in red (congruent); then all red/congruent.
    const values = [0, 0.9, 0, 0, 0.1];
    let k = 0;
    render(
      <MemoryRouter initialEntries={['/?duration=5']}>
        <StroopPage random={() => (k < values.length ? values[k++] : 0)} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    expect(screen.getByTestId('stroop-word')).toHaveTextContent('Синий');
    await advance(800);
    fireEvent.click(screen.getByRole('button', { name: 'Красный' }));
    await advance(500);
    fireEvent.click(screen.getByRole('button', { name: 'Красный' }));
    await advance(4_000);
    expect(await screen.findByText('Результат сохранён.')).toBeInTheDocument();
    expect(screen.getByText('Эффект интерференции').nextElementSibling).toHaveTextContent('300 мс');
    const row = await db.mindSessions.toCollection().first();
    expect(row).toMatchObject({
      kind: 'stroop',
      accuracyPct: 100,
      meanRtMs: 650,
      errors: 0,
      interferenceMs: 300,
      durationMs: 5_000,
    });
  });

  it('Given earlier sessions When I finish Then my result is compared with my average', async () => {
    await saveStroopSession({ startedAt: at(1), durationMs: 60_000, accuracyPct: 90, meanRtMs: 900, errors: 2 });
    fakeClock();
    render(
      <MemoryRouter initialEntries={['/?duration=5']}>
        <StroopPage random={() => 0} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    await advance(600);
    fireEvent.click(screen.getByRole('button', { name: 'Красный' }));
    await advance(5_000);
    expect(await screen.findByText('На 300 мс лучше, чем личное среднее 900 мс.')).toBeInTheDocument();
  });
});

describe('Schulte', () => {
  const tableOrder = () => screen.getAllByRole('button', { name: /^\d+$/ }).map((b) => b.textContent);

  it('Given «Шульте» When I find 1–25 Then time and errors are shown, saved, and compared with my average', async () => {
    await saveSchulteSession({ startedAt: at(1), durationMs: 5_000, accuracyPct: 100, errors: 0 });
    fakeClock();
    render(
      <MemoryRouter>
        <SchultePage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    await advance(100);
    fireEvent.click(screen.getByRole('button', { name: '5' })); // wrong: 1 is next
    for (let n = 1; n <= 25; n++) {
      await advance(100);
      fireEvent.click(screen.getByRole('button', { name: String(n) }));
    }
    expect(await screen.findByText('Результат сохранён.')).toBeInTheDocument();
    expect(screen.getByText('Время').nextElementSibling).toHaveTextContent('2,6 с');
    expect(screen.getByText('Ошибки').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('На 2,4 с лучше, чем личное среднее 5,0 с.')).toBeInTheDocument();
    const rows = await db.mindSessions.where('kind').equals('schulte').toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.durationMs === 2_600)).toMatchObject({ errors: 1, accuracyPct: 96 });
  });

  it('the table is different at every launch', async () => {
    let seed = 11;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    render(
      <MemoryRouter>
        <SchultePage random={random} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    const first = tableOrder();
    fireEvent.click(screen.getByRole('button', { name: 'Прервать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    expect(tableOrder()).not.toEqual(first);
    expect([...tableOrder()].sort((a, b) => Number(a) - Number(b))).toHaveLength(25);
  });
});

describe('empty and interrupted runs', () => {
  it('a Stroop run with no answers is not saved and says so', async () => {
    fakeClock();
    render(
      <MemoryRouter initialEntries={['/?duration=3']}>
        <StroopPage random={() => 0} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    await advance(3_500);
    expect(await screen.findByText(/Ни одного ответа/)).toBeInTheDocument();
    expect(await db.mindSessions.count()).toBe(0);
  });

  it('a Stroop run with only wrong answers is saved and compared by accuracy', async () => {
    await saveStroopSession({ startedAt: at(1), durationMs: 60_000, accuracyPct: 90, meanRtMs: 900, errors: 2 });
    fakeClock();
    render(
      <MemoryRouter initialEntries={['/?duration=3']}>
        <StroopPage random={() => 0} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    await advance(300);
    fireEvent.click(screen.getByRole('button', { name: 'Синий' }));
    await advance(3_500);
    expect(await screen.findByText('На 90% хуже, чем личное среднее 90%.')).toBeInTheDocument();
  });

  it('a Schulte run is cancelled when the app goes to the background', async () => {
    render(
      <MemoryRouter>
        <SchultePage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByText(/Сессия прервана/)).toBeInTheDocument();
    spy.mockRestore();
    expect(await db.mindSessions.count()).toBe(0);
  });
});

describe('exercise list', () => {
  it('Given the module screen Then PVT, n-back, Струп and Шульте are listed with the last result', async () => {
    await savePvtResult({
      startedAt: new Date(2026, 10, 3, 8).getTime(),
      durationMs: 60_000,
      result: { reactionTimesMs: [280], medianRtMs: 280, lapses: 0, falseStarts: 0 },
    });
    await saveNbackSession({ startedAt: at(2), durationMs: 180_000, level: 3, accuracyPct: 90, errors: 1 });
    await saveStroopSession({ startedAt: at(2), durationMs: 60_000, accuracyPct: 92, meanRtMs: 640, errors: 3 });
    await saveSchulteSession({ startedAt: at(2), durationMs: 41_240, accuracyPct: 96, errors: 1 });
    render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<CognitionHome today="2026-11-04" />} />
        </Routes>
      </MemoryRouter>,
    );
    const card = (await screen.findByText('Упражнения')).closest('div')!;
    // Every exercise reads its own live query; wait for each last result instead of only the first one,
    // otherwise the later queries may still be loading when the machine is busy.
    for (const [name, href, last] of [
      ['PVT', '/cognition/pvt', 'медиана 280 мс'],
      ['n-back', '/cognition/nback', 'n = 3, точность 90%'],
      ['Струп', '/cognition/stroop', 'точность 92%, 640 мс'],
      ['Шульте', '/cognition/schulte', '41,2 с, ошибок 1'],
    ]) {
      expect(within(card).getByRole('link', { name })).toHaveAttribute('href', href);
      expect(await within(card).findByText(last)).toBeInTheDocument();
    }
  });

  it('without results every exercise says so', async () => {
    render(
      <MemoryRouter>
        <CognitionHome today="2026-11-04" />
      </MemoryRouter>,
    );
    expect(await screen.findAllByText('Ещё нет результатов')).toHaveLength(4);
  });
});
