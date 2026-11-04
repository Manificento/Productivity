import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../../core/db';
import { PvtPage } from './PvtPage';

/** random() = 0 → every stimulus comes exactly 2 s after the previous tap (or the start). */
const random = () => 0;

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/cognition/pvt" element={<PvtPage random={random} />} />
        <Route path="/cognition" element={<h1>Экран модуля</h1>} />
        <Route path="/" element={<h1>Сегодня</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Advances the fake clock frame by frame so the requestAnimationFrame loop runs as in a browser. */
function advance(ms: number) {
  act(() => {
    for (let t = 0; t < ms; t += 16) vi.advanceTimersByTime(Math.min(16, ms - t));
  });
}

const tapArea = () => screen.getByRole('button', { name: 'Область реакции' });
const tap = () => act(() => void fireEvent.pointerDown(tapArea()));

beforeEach(async () => {
  await db.cognitiveTests.clear();
  // Only the animation clock is faked: IndexedDB (fake-indexeddb) keeps its real timers.
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PVT screen', () => {
  it('Given I open /cognition/pvt When I press «Начать» Then a stimulus appears after a random 2–10 s pause and I tap it', () => {
    renderAt('/cognition/pvt');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    expect(screen.getByText('Осталось 60 с')).toBeInTheDocument();
    advance(1_900);
    expect(screen.queryByText('Жми!')).not.toBeInTheDocument();
    advance(200);
    expect(screen.getByText('Жми!')).toBeInTheDocument();
    advance(240);
    tap();
    expect(screen.queryByText('Жми!')).not.toBeInTheDocument();
    expect(screen.getByText(/^\d+ мс$/)).toBeInTheDocument();
  });

  it('the full-screen test keeps clear of side cutouts in landscape (safe-area-inset-left/right)', () => {
    renderAt('/cognition/pvt');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    // jsdom has no env(): the insets are checked via their Tailwind classes on the overlay root.
    const overlay = tapArea().closest('.fixed');
    expect(overlay).toHaveClass('pl-[env(safe-area-inset-left)]', 'pr-[env(safe-area-inset-right)]');
  });

  it('Given I tap before the stimulus When the test runs Then it is a false start with a short message', () => {
    renderAt('/cognition/pvt');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(500);
    tap();
    expect(screen.getByText('Фальстарт — рано!')).toBeInTheDocument();
  });

  it('Given the test ended Then results show the median, lapses (> 500 ms), false starts and a CognitiveTest is saved', async () => {
    renderAt('/cognition/pvt?duration=10');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(500);
    tap(); // false start; next stimulus at ~2.5 s
    advance(2_300);
    tap(); // ~300 ms reaction
    advance(2_700);
    tap(); // ~700 ms reaction → lapse
    advance(5_000); // the stimulus at ~7.5 s is never answered → second lapse

    expect(screen.getByText('Медиана реакции').nextElementSibling).toHaveTextContent('494 мс');
    expect(screen.getByText('Пропуски (> 500 мс)').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Фальстарты').nextElementSibling).toHaveTextContent('1');
    expect(await screen.findByText('Результат сохранён.')).toBeInTheDocument();

    const [saved] = await db.cognitiveTests.toArray();
    expect(saved).toMatchObject({ kind: 'pvt', durationMs: 10_000, falseStarts: 1, lapses: 2 });
    expect(saved.reactionTimesMs).toEqual([288, 700]);
  });

  it('a run without a single valid reaction is not saved and says so', async () => {
    renderAt('/cognition/pvt?duration=1');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(1_100);
    expect(screen.getByRole('alert')).toHaveTextContent('Ни одной засчитанной реакции');
    expect(await db.cognitiveTests.count()).toBe(0);
  });

  it('Given the route is opened with ?return=/ When I close the results Then I am back on «Сегодня»', async () => {
    renderAt('/cognition/pvt?return=/&duration=5');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(2_300);
    tap();
    advance(3_000);
    await screen.findByText('Результат сохранён.');
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
  });

  it('without ?return closing the results opens the module screen', async () => {
    renderAt('/cognition/pvt?duration=5');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(2_300);
    tap();
    advance(3_000);
    await screen.findByText('Результат сохранён.');
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getByRole('heading', { name: 'Экран модуля' })).toBeInTheDocument();
  });

  it('Given the tab goes to the background during the test When I come back Then the test is cancelled with an explanation', async () => {
    renderAt('/cognition/pvt?duration=5');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(1_000);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    visibility.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    advance(5_000);

    expect(screen.getByRole('alert')).toHaveTextContent('Тест прерван');
    expect(screen.getByRole('button', { name: 'Начать заново' })).toBeInTheDocument();
    expect(screen.queryByText('Результат')).not.toBeInTheDocument();
    expect(await db.cognitiveTests.count()).toBe(0);
    visibility.mockRestore();
  });

  it('a failed save is reported and the results can still be closed', async () => {
    const add = vi.spyOn(db.cognitiveTests, 'add').mockRejectedValueOnce(new Error('quota'));
    renderAt('/cognition/pvt?duration=5');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(2_300);
    tap();
    advance(3_000);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить результат');
    expect(screen.getByRole('button', { name: 'Готово' })).toBeEnabled();
    add.mockRestore();
  });

  it('a second finger of the same touch is not counted as another tap', () => {
    renderAt('/cognition/pvt');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(500);
    act(() => void fireEvent.pointerDown(tapArea(), { isPrimary: false, pointerType: 'touch' }));
    expect(screen.queryByText('Фальстарт — рано!')).not.toBeInTheDocument();
  });

  it('«Прервать» stops the run without saving', async () => {
    renderAt('/cognition/pvt');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    advance(500);
    fireEvent.click(screen.getByRole('button', { name: 'Прервать' }));
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument();
    expect(await db.cognitiveTests.count()).toBe(0);
  });
});
