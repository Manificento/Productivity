import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppModule } from './moduleTypes';

// A fake registry: one module with a background component, one without.
vi.mock('./modules', () => {
  const alpha: AppModule = {
    id: 'alpha',
    title: 'Альфа',
    path: '/alpha',
    icon: 'α',
    navOrder: 1,
    Page: () => <h1>Альфа</h1>,
    Background: () => <p>фон альфы</p>,
  };
  const beta: AppModule = {
    id: 'beta',
    title: 'Бета',
    path: '/beta',
    icon: 'β',
    navOrder: 2,
    Page: () => <h1>Бета</h1>,
  };
  return { MODULES: [alpha, beta], NAV_MODULES: [alpha, beta] };
});

const { App } = await import('./App');

describe('App shell background components', () => {
  it('Given оболочка When модуль объявляет фоновый компонент в манифесте AppModule Then оболочка монтирует его на всех страницах', async () => {
    for (const hash of ['#/alpha', '#/beta']) {
      window.location.hash = hash;
      const { unmount } = render(<App />);
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getAllByText('фон альфы')).toHaveLength(1);
      unmount();
    }
  });
});
