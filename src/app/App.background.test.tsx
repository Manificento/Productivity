import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AppModule } from './moduleTypes';

const mounts = vi.hoisted(() => ({ count: 0 }));

// A fake registry: one module with a background component, one without.
vi.mock('./modules', () => {
  function AlphaBackground() {
    useEffect(() => {
      mounts.count++;
    }, []);
    return <p>фон альфы</p>;
  }
  const alpha: AppModule = {
    id: 'alpha',
    title: 'Альфа',
    path: '/alpha',
    icon: 'α',
    navOrder: 1,
    Page: () => <h1>Альфа</h1>,
    Background: AlphaBackground,
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
    window.location.hash = '#/beta';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Бета' })).toBeInTheDocument();
    expect(screen.getAllByText('фон альфы')).toHaveLength(1);

    // Navigating between modules keeps the same instance: mounted once, outside the routes.
    await userEvent.click(screen.getByRole('link', { name: /Альфа/ }));
    expect(await screen.findByRole('heading', { name: 'Альфа' })).toBeInTheDocument();
    expect(screen.getAllByText('фон альфы')).toHaveLength(1);
    expect(mounts.count).toBe(1);
  });
});
