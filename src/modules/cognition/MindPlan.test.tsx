import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../core/db';
import type { DateKey } from '../../core/types';
import { CognitionHome } from './CognitionHome';
import { saveNbackSession, saveSchulteSession, saveStroopSession } from './data/mindSessions';

const TODAY = '2026-11-04';
const at = (d: number) => new Date(2026, 10, d, 9).getTime();

beforeEach(async () => {
  await Promise.all([db.mindSessions.clear(), db.lifeEvents.clear(), db.checkIns.clear(), db.settings.clear()]);
});

function renderHome(today: DateKey = TODAY) {
  render(
    <MemoryRouter>
      <CognitionHome today={today} />
    </MemoryRouter>,
  );
}

describe('mind-training plan card', () => {
  it('Given mindTrainingMin = 10 When I open the block Then «Сегодня 10 мин: n-back 5 мин, Струп 5 мин»', async () => {
    renderHome();
    expect(await screen.findByText('Сегодня 10 мин: n-back 5 мин, Струп 5 мин')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Начать: n-back' })).toHaveAttribute('href', '/cognition/nback');
    expect(screen.getByRole('link', { name: 'Начать: Струп' })).toHaveAttribute('href', '/cognition/stroop');
  });

  it('Given mindTrainingMin = 0 (low energy) When I open the block Then «без тренажёров» with the reason; trainers stay available manually', async () => {
    await db.checkIns.add({ id: 'c', date: TODAY, energy: 2, focus: 3, createdAt: 1, updatedAt: 1 });
    renderHome();
    expect(await screen.findByText('Сегодня без тренажёров: низкая энергия в чек-ине')).toBeInTheDocument();
    expect(screen.getByText(/без тренажёров ума/)).toBeInTheDocument();
    for (const name of ['PVT', 'n-back', 'Струп', 'Шульте'])
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Начать:/ })).not.toBeInTheDocument();
  });

  it('Given phase taper When I open the block Then only one light session ≤ 5 min; PVT stays', async () => {
    await db.lifeEvents.add({
      id: 'e1',
      createdAt: 1,
      updatedAt: 1,
      title: 'IELTS',
      type: 'exam',
      date: '2026-11-10',
      importance: 3,
      prepDays: 7,
    });
    renderHome('2026-11-09');
    expect(await screen.findByText('Сегодня 5 мин: Струп 5 мин')).toBeInTheDocument();
    expect(screen.getByText(/Лёгкий день/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Начать: n-back' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PVT' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пройти тест' })).toBeInTheDocument();
  });

  it('Given the sessions are done When the plan is closed Then a check mark and the minutes appear in the day history', async () => {
    await saveNbackSession({ startedAt: at(4), durationMs: 180_000, level: 2, accuracyPct: 80, errors: 3 });
    await saveStroopSession({ startedAt: at(4), durationMs: 60_000, accuracyPct: 90, errors: 2 });
    renderHome();
    expect(await screen.findByText('Выполнено 4 из 10 мин')).toBeInTheDocument();

    await saveSchulteSession({ startedAt: at(4), durationMs: 360_000, accuracyPct: 95, errors: 1 });
    expect(await screen.findByText('✓ План выполнен: 10 мин')).toBeInTheDocument();
    const history = screen.getByRole('list', { name: 'Сегодня сделано' });
    expect(history).toHaveTextContent('n-back — 3 мин');
    expect(history).toHaveTextContent('Струп — 1 мин');
    expect(history).toHaveTextContent('Шульте — 6 мин');
  });

  it('sessions of another day do not count', async () => {
    await saveNbackSession({ startedAt: at(3), durationMs: 600_000, level: 2, accuracyPct: 80, errors: 3 });
    renderHome();
    expect(await screen.findByText('Выполнено 0 из 10 мин')).toBeInTheDocument();
  });
});
