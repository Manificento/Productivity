import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as backup from '../../../core/backup';
import { db, TABLE_NAMES } from '../../../core/db';
import { SettingsPage } from '../SettingsPage';
import { DemoDataCard } from './DemoDataCard';

const NOW = new Date(2026, 10, 4, 10, 0);

const fill = () => fireEvent.click(screen.getByRole('button', { name: 'Заполнить демо-данными' }));
const dialog = () => screen.findByRole('dialog', { name: 'Заполнить демо-данными?' });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('demo data', () => {
  it('Given the «Настройки» screen When I press «Заполнить демо-данными» and confirm Then 2 weeks of data of all blocks and an IELTS event in 5 days are loaded through importAll', async () => {
    const importAll = vi.spyOn(backup, 'importAll');
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    fill();
    const sheet = await dialog();
    expect(sheet).toHaveTextContent('Приложение заполнится примером за 14 дней');
    expect(importAll).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Заполнить' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Демо-данные загружены');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(importAll).toHaveBeenCalledTimes(1);
    for (const name of TABLE_NAMES.filter((n) => n !== 'settings')) {
      expect(await db.table(name).count(), name).toBeGreaterThan(0);
    }
    const sleepDays = (await db.sleepLogs.toArray()).map((s) => s.date).sort();
    expect(sleepDays).toHaveLength(14);
    expect([sleepDays[0], sleepDays[13]]).toEqual(['2026-10-22', '2026-11-04']);
    expect(await db.lifeEvents.toArray()).toEqual([
      expect.objectContaining({ title: 'IELTS', type: 'exam', date: '2026-11-09' }),
    ]);
  });

  it('Given I have my own data When I press the button Then a warning says the data will be replaced and offers to export first', async () => {
    await db.tasks.put({ id: 'mine', createdAt: 0, updatedAt: 0, title: 'Моя задача', priority: 1, tags: [] });
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<DemoDataCard today="2026-11-04" onExport={onExport} />);
    fill();
    const sheet = await dialog();
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Все ваши текущие данные будут заменены демо-данными');
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Сначала сделайте экспорт');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Сначала экспорт' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    // Nothing is replaced until «Заменить» is pressed.
    expect(await db.tasks.get('mine')).toBeDefined();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Заменить' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Демо-данные загружены');
    expect(await db.tasks.get('mine')).toBeUndefined();
  });

  it('cancelling keeps the current data', async () => {
    await db.tasks.put({ id: 'mine', createdAt: 0, updatedAt: 0, title: 'Моя задача', priority: 1, tags: [] });
    render(<DemoDataCard today="2026-11-04" onExport={vi.fn()} />);
    fill();
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await db.tasks.count()).toBe(1);
  });

  it('a failed load shows an error and keeps the sheet open', async () => {
    vi.spyOn(backup, 'importAll').mockRejectedValueOnce(new Error('quota'));
    render(<DemoDataCard today="2026-11-04" onExport={vi.fn()} />);
    fill();
    const sheet = await dialog();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Заполнить' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Не удалось загрузить демо-данные');
  });
});
