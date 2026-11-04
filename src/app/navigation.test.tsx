import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../core/db';
import { App } from './App';
import { MODULE_GROUPS, MODULES, PINNED_MODULES } from './modules';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.settings.put({ key: 'adaptation.onboardingDone', value: true });
});

const bottomBar = () => screen.getByRole('navigation', { name: 'Модули' });

describe('Навигация по 12 блокам', () => {
  it('Given манифест модуля When я читаю AppModule Then есть поле group; navOrder означает закреплённую вкладку', () => {
    expect(MODULES).toHaveLength(12);
    for (const m of MODULES) {
      expect(Object.keys(MODULE_GROUPS)).toContain(m.group);
      expect(m.summary.length, m.id).toBeGreaterThan(0);
    }
    // Pinned by default: tasks, habits, time (today is the hub and always first).
    expect(PINNED_MODULES.map((m) => m.id)).toEqual(['tasks', 'habits', 'time']);
    // A fourth pin would be dropped silently by the bar: only these have navOrder.
    expect(MODULES.filter((m) => m.navOrder !== undefined).map((m) => m.id)).toEqual([
      'today',
      'tasks',
      'habits',
      'time',
    ]);
  });

  it('Given 12 модулей When я открываю приложение Then нижняя панель: «Сегодня», до трёх закреплённых и «Блоки»', async () => {
    window.location.hash = '#/';
    render(<App />);
    await screen.findByRole('heading', { name: 'Сегодня', level: 1 });
    const links = within(bottomBar()).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['🏠Сегодня', '✅Задачи', '🔁Привычки', '⏱️Время', '🧩Блоки']);
    // jsdom has no layout: the 44 px tap target is checked via its class (e2e measures it).
    for (const link of links) expect(link).toHaveClass('min-h-11');
    expect(within(bottomBar()).getByRole('link', { name: /Сегодня/ })).toHaveAttribute('aria-current', 'page');
  });

  it('Given нижняя панель When я нажимаю «Блоки» Then экран со всеми модулями по группам: иконка, название, строка смысла; каркасы помечены «скоро»', async () => {
    window.location.hash = '#/';
    render(<App />);
    await screen.findByRole('heading', { name: 'Сегодня', level: 1 });
    await userEvent.click(within(bottomBar()).getByRole('link', { name: /Блоки/ }));

    expect(await screen.findByRole('heading', { name: 'Все блоки', level: 1 })).toBeInTheDocument();
    for (const [, label] of Object.entries(MODULE_GROUPS)) {
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
    }
    for (const m of MODULES) {
      const region = screen.getByRole('region', { name: MODULE_GROUPS[m.group] });
      const link = within(region).getByRole('link', { name: new RegExp(m.title) });
      expect(link).toHaveTextContent(m.icon);
      expect(link).toHaveTextContent(m.summary);
      if (m.comingSoon) expect(link).toHaveTextContent('скоро');
      else expect(link).not.toHaveTextContent('скоро');
    }
  });

  it('Given экран «Блоки» When я выбираю модуль Then открывается его маршрут; для незакреплённых подсвечена кнопка «Блоки»', async () => {
    window.location.hash = '#/blocks';
    render(<App />);
    await userEvent.click(await screen.findByRole('link', { name: /Сон/ }));
    expect(await screen.findByRole('heading', { name: 'Сон', level: 1 })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/health');
    expect(within(bottomBar()).getByRole('link', { name: /Блоки/ })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(within(bottomBar()).getByRole('link', { name: /Задачи/ }));
    expect(await screen.findByRole('heading', { name: 'Задачи', level: 1 })).toBeInTheDocument();
    expect(within(bottomBar()).getByRole('link', { name: /Задачи/ })).toHaveAttribute('aria-current', 'page');
    expect(within(bottomBar()).getByRole('link', { name: /Блоки/ })).not.toHaveAttribute('aria-current');
  });
});
