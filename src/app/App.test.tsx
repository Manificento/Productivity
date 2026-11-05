import { render, screen, within } from '@testing-library/react';
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
    // Onboarding (#41) is shown until the today module stores this flag.
    await db.settings.put({ key: 'adaptation.onboardingDone', value: true });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(await screen.findByText(/Цели дня/)).toBeInTheDocument();
    for (const label of ['Задачи', 'Привычки', 'Время', 'Блоки']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('Given альбомная ориентация с вырезом сбоку When открыт любой экран Then нижняя навигация учитывает safe-area-inset-left/right', async () => {
    await db.settings.put({ key: 'adaptation.onboardingDone', value: true });
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Модули' });
    expect(nav).toHaveClass('pl-[env(safe-area-inset-left)]', 'pr-[env(safe-area-inset-right)]');
  });

  it('opens the onboarding screen «Какое у тебя ближайшее важное событие?» at / on an empty DB', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Какое у тебя ближайшее важное событие?' })).toBeInTheDocument();
    expect(screen.queryByText(/Цели дня/)).not.toBeInTheDocument();
  });

  it('Given модули progress, notes When я открываю их маршруты Then пустое состояние с названием блока и «скоро»; в навигации они пока скрыты', async () => {
    const skeletons: [string, string][] = [
      ['progress', 'Прогресс'],
      ['notes', 'Заметки'],
    ];
    for (const [id, title] of skeletons) {
      window.location.hash = `#/${id}`;
      const { unmount } = render(<App />);
      expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
      expect(screen.getByText(/скоро/i)).toBeInTheDocument();
      const nav = screen.getByRole('navigation', { name: 'Модули' });
      expect(within(nav).queryByRole('link', { name: new RegExp(title) })).not.toBeInTheDocument();
      unmount();
    }
  });
});
