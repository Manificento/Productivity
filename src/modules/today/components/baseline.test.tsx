import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import { db } from '../../../core/db';
import { todayModule } from '../index';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.settings.clear();
});

async function fill(label: string, value: string) {
  const user = userEvent.setup();
  const input = await screen.findByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

describe('Базовый режим', () => {
  it('Given экран «Базовый режим» When я меняю ёмкость дня на 300 мин и отбой на 23:00 Then сохраняется в settings под adaptation.baseline, цели обычного дня меняются', async () => {
    const user = userEvent.setup();
    renderAt('/today/baseline');
    expect(await screen.findByRole('heading', { name: 'Базовый режим' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Ёмкость дня, мин')).toHaveValue(360);
    await fill('Ёмкость дня, мин', '300');
    await fill('Отбой', '23:00');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Сохранено'));
    expect((await db.settings.get(BASELINE_SETTING_KEY))?.value).toEqual({
      ...DEFAULT_BASELINE,
      taskCapacityMin: 300,
      bedtime: '23:00',
    });

    await user.click(screen.getByRole('link', { name: '← Сегодня' }));
    expect(await screen.findByText('5 ч')).toBeInTheDocument();
    expect(screen.getByText(/отбой 23:00/)).toBeInTheDocument();
  });

  it('Given изменённый режим When я нажимаю «Сбросить» Then возвращаются DEFAULT_BASELINE', async () => {
    const user = userEvent.setup();
    await db.settings.put({ key: BASELINE_SETTING_KEY, value: { ...DEFAULT_BASELINE, taskCapacityMin: 300 } });
    renderAt('/today/baseline');
    await waitFor(() => expect(screen.getByLabelText('Ёмкость дня, мин')).toHaveValue(300));
    await user.click(screen.getByRole('button', { name: 'Сбросить' }));

    await waitFor(() => expect(screen.getByLabelText('Ёмкость дня, мин')).toHaveValue(360));
    expect(screen.getByRole('status')).toHaveTextContent('Сброшено');
    expect(await db.settings.get(BASELINE_SETTING_KEY)).toBeUndefined();
  });

  it('Given ввод ёмкости 0 или > 960 When сохранение Then ошибка валидации (zod)', async () => {
    const user = userEvent.setup();
    renderAt('/today/baseline');
    await fill('Ёмкость дня, мин', '0');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('От 1 до 960 минут');

    await fill('Ёмкость дня, мин', '961');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('От 1 до 960 минут');
    expect(await db.settings.get(BASELINE_SETTING_KEY)).toBeUndefined();
  });

  it('Given несохранённые правки при стандартном режиме When «Сбросить» Then поля = DEFAULT_BASELINE', async () => {
    const user = userEvent.setup();
    renderAt('/today/baseline');
    await fill('Ёмкость дня, мин', '0');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('От 1 до 960 минут');

    await user.click(screen.getByRole('button', { name: 'Сбросить' }));
    await waitFor(() => expect(screen.getByLabelText('Ёмкость дня, мин')).toHaveValue(360));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('quota'));
    renderAt('/today/baseline');
    await fill('Ёмкость дня, мин', '300');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить');
  });

  it('links to the baseline from the Today screen', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /Базовый режим/ })).toHaveAttribute('href', '/today/baseline');
  });
});
