import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../core/db';
import { CognitionHome } from './CognitionHome';
import { savePvtResult } from './data/cognitiveTests';

const TODAY = '2026-11-04';

async function addResult(day: number, medianRtMs: number) {
  await savePvtResult({
    startedAt: new Date(2026, 10, day, 8).getTime(),
    durationMs: 60_000,
    result: { reactionTimesMs: [medianRtMs], medianRtMs, lapses: 0, falseStarts: 0 },
  });
}

function renderHome() {
  render(
    <MemoryRouter>
      <CognitionHome today={TODAY} />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.cognitiveTests.clear();
});

describe('cognition module screen', () => {
  it('Given ≥ 2 results When the module screen opens Then the 14-day median history (SVG) and a comparison with my average are shown', async () => {
    await addResult(1, 300);
    await addResult(2, 320);
    await addResult(4, 270);
    renderHome();
    expect(await screen.findByRole('img', { name: /Медиана реакции за 14 дней/ })).toBeInTheDocument();
    expect(screen.getByText(/на 40 мс быстрее вашего среднего/)).toBeInTheDocument();
  });

  it('a slower latest result is called slower than my average', async () => {
    await addResult(1, 250);
    await addResult(4, 300);
    renderHome();
    expect(await screen.findByText(/на 50 мс медленнее вашего среднего/)).toBeInTheDocument();
  });

  it('with no results it explains how to get a history and offers the test', async () => {
    renderHome();
    expect(await screen.findByText(/Пока нет результатов/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пройти тест' })).toHaveAttribute('href', '/cognition/pvt');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('with a single result there is no chart yet', async () => {
    await addResult(4, 280);
    renderHome();
    expect(await screen.findByText(/Есть один результат/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
