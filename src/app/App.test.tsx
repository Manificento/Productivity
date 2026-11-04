import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('serves the cognition module at /cognition', async () => {
    window.location.hash = '#/cognition/pvt';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Тест внимания' })).toBeInTheDocument();
  });

  it('renders the Today screen with adaptation targets and bottom navigation', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(await screen.findByText(/Цели дня/)).toBeInTheDocument();
    for (const label of ['Задачи', 'Привычки', 'Время', 'Здоровье']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });
});
