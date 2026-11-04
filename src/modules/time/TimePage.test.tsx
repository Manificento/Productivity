import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import { atLocalTime } from '../../core/logging/sleepTime';
import { TimePage } from './TimePage';
import { createDefaultCategories, listCategories } from './data/timeStore';

const NOW = atLocalTime('2026-11-02', '10:00');

async function categoryId(name: string) {
  const c = (await listCategories()).find((x) => x.name === name);
  if (!c) throw new Error(`no category ${name}`);
  return c.id;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all([db.timeCategories.clear(), db.timeEntries.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TimePage', () => {
  it('категорий нет: при открытии «Время» предлагают стартовый набор Учёба, Работа, Спорт, Отдых, Быт', async () => {
    const user = userEvent.setup();
    render(<TimePage />);
    expect(await screen.findByText(/Учёба, Работа, Спорт, Отдых, Быт/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Добавить стартовый набор' }));

    for (const name of ['Учёба', 'Работа', 'Спорт', 'Отдых', 'Быт']) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
    expect(await db.timeCategories.count()).toBe(5);
  });

  it('есть категории: тап «Учёба» создаёт TimeEntry без end, вверху виден идущий таймер с длительностью', async () => {
    await createDefaultCategories();
    const user = userEvent.setup();
    render(<TimePage />);

    await user.click(await screen.findByRole('button', { name: 'Учёба' }));

    const timer = await screen.findByRole('timer', { name: 'Идущий таймер' });
    expect(within(timer).getByText('Учёба')).toBeInTheDocument();
    expect(within(timer).getByText('00:00')).toBeInTheDocument();
    const entries = await db.timeEntries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      categoryId: await categoryId('Учёба'),
      start: NOW,
      date: '2026-11-02',
      source: 'timer',
    });
    expect(entries[0]?.end).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Учёба' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('идёт таймер: после перезагрузки страницы таймер продолжается с правильного времени', async () => {
    await createDefaultCategories();
    const work = await categoryId('Работа');
    await db.timeEntries.add(
      newRecord({ categoryId: work, start: NOW - (5 * 60_000 + 7_000), date: '2026-11-02', source: 'timer' as const }),
    );

    const first = render(<TimePage />);
    expect(await screen.findByText('05:07')).toBeInTheDocument();
    first.unmount();

    vi.setSystemTime(NOW + 60 * 60_000);
    render(<TimePage />);
    const timer = await screen.findByRole('timer', { name: 'Идущий таймер' });
    expect(within(timer).getByText('Работа')).toBeInTheDocument();
    expect(within(timer).getByText('1:05:07')).toBeInTheDocument();
  });

  it('идёт таймер: нажатие «Стоп» проставляет end', async () => {
    await createDefaultCategories();
    const user = userEvent.setup();
    render(<TimePage />);
    await user.click(await screen.findByRole('button', { name: 'Спорт' }));
    await screen.findByRole('timer');

    vi.setSystemTime(NOW + 30 * 60_000);
    await user.click(screen.getByRole('button', { name: 'Стоп' }));

    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument());
    const [entry] = await db.timeEntries.toArray();
    expect(entry?.end).toBe(NOW + 30 * 60_000);
  });

  it('тап другой категории при идущем таймере завершает первый в момент старта второго', async () => {
    await createDefaultCategories();
    const user = userEvent.setup();
    render(<TimePage />);
    await user.click(await screen.findByRole('button', { name: 'Учёба' }));
    await screen.findByRole('timer');

    vi.setSystemTime(NOW + 10 * 60_000);
    await user.click(screen.getByRole('button', { name: 'Работа' }));

    await waitFor(async () => expect(await db.timeEntries.count()).toBe(2));
    const entries = (await db.timeEntries.toArray()).sort((a, b) => a.start - b.start);
    expect(entries[0]?.end).toBe(NOW + 10 * 60_000);
    expect(entries[1]).toMatchObject({ categoryId: await categoryId('Работа'), start: NOW + 10 * 60_000 });
    expect(entries[1]?.end).toBeUndefined();

    // tapping the running category again does not split the entry
    await user.click(screen.getByRole('button', { name: 'Работа' }));
    expect(await db.timeEntries.count()).toBe(2);
  });

  it('добавляю запись вручную: категория, начало и конец → запись сохраняется', async () => {
    await createDefaultCategories();
    const user = userEvent.setup();
    render(<TimePage />);
    await user.click(await screen.findByRole('button', { name: '+ Запись вручную' }));

    const dialog = screen.getByRole('dialog', { name: 'Запись вручную' });
    await user.selectOptions(within(dialog).getByLabelText('Категория'), 'Отдых');
    await user.clear(within(dialog).getByLabelText('Начало'));
    await user.type(within(dialog).getByLabelText('Начало'), '2026-11-01T23:30');
    await user.clear(within(dialog).getByLabelText('Конец'));
    await user.type(within(dialog).getByLabelText('Конец'), '2026-11-02T00:30');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Запись сохранена');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const [entry] = await db.timeEntries.toArray();
    expect(entry).toMatchObject({
      categoryId: await categoryId('Отдых'),
      start: atLocalTime('2026-11-01', '23:30'),
      end: atLocalTime('2026-11-02', '00:30'),
      date: '2026-11-01',
      source: 'manual',
    });
  });

  it('добавляю запись вручную: конец раньше начала — ошибка, запись не сохраняется', async () => {
    await createDefaultCategories();
    const user = userEvent.setup();
    render(<TimePage />);
    await user.click(await screen.findByRole('button', { name: '+ Запись вручную' }));

    const dialog = screen.getByRole('dialog', { name: 'Запись вручную' });
    await user.clear(within(dialog).getByLabelText('Начало'));
    await user.type(within(dialog).getByLabelText('Начало'), '2026-11-02T09:00');
    await user.clear(within(dialog).getByLabelText('Конец'));
    await user.type(within(dialog).getByLabelText('Конец'), '2026-11-02T08:00');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Конец должен быть позже начала');
    expect(await db.timeEntries.count()).toBe(0);
  });
});
