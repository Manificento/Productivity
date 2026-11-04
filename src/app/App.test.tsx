import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../core/db';
import { App } from './App';

describe('App shell', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('serves the cognition module at /cognition', async () => {
    window.location.hash = '#/cognition/pvt';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Тест внимания' })).toBeInTheDocument();
  });

  it('renders the Today screen with adaptation targets and bottom navigation', async () => {
    await db.settings.put({ key: 'adaptation.onboardingDone', value: true });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(await screen.findByText(/Цели дня/)).toBeInTheDocument();
    for (const label of ['Задачи', 'Привычки', 'Время', 'Здоровье']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });
});
