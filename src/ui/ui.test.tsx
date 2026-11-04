import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Field, Input, Page, Progress, Rating, Segmented, Sheet, Tabs } from '.';

describe('UI kit', () => {
  it('Field associates its label with the control', () => {
    render(<Field label="Название">{(id) => <Input id={id} defaultValue="Чтение" />}</Field>);
    expect(screen.getByLabelText('Название')).toHaveValue('Чтение');
  });

  it('Field shows an error as an alert instead of the hint', () => {
    render(
      <Field label="Граммы" hint="на порцию" error="Введите число">
        {(id) => <Input id={id} />}
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Введите число');
    expect(screen.queryByText('на порцию')).not.toBeInTheDocument();
  });

  it('Given телефон с вырезом When открыто приложение Then шапка Page с ⚙️ учитывает safe-area-inset-top', () => {
    render(
      <MemoryRouter>
        <Page title="Задачи" actions={<button type="button">Добавить</button>}>
          <p>список</p>
        </Page>
      </MemoryRouter>,
    );
    const header = screen.getByRole('banner');
    // jsdom has no layout or env(): the safe-area padding is checked via its Tailwind class.
    expect(header.closest('section')).toHaveClass('pt-[max(1rem,env(safe-area-inset-top))]');
    const settings = within(header).getByRole('link', { name: 'Настройки' });
    expect(settings).toHaveAttribute('href', '/settings');
    expect(settings).toHaveClass('size-11');
    expect(within(header).getByRole('button', { name: 'Добавить' })).toBeInTheDocument();
  });

  it('Given альбомная ориентация с вырезом сбоку When открыт любой экран Then боковые отступы Page и Sheet учитывают safe-area-inset-left/right', () => {
    render(
      <MemoryRouter>
        <Page title="Задачи">
          <Sheet open title="Новая задача" onClose={() => {}}>
            <p>форма</p>
          </Sheet>
        </Page>
      </MemoryRouter>,
    );
    // jsdom has no layout or env(): the insets are checked via their Tailwind classes.
    const sides = ['pl-[max(1rem,env(safe-area-inset-left))]', 'pr-[max(1rem,env(safe-area-inset-right))]'];
    expect(screen.getByRole('banner').closest('section')).toHaveClass(...sides);
    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toHaveClass(...sides);
  });

  it('Given экран «Настройки» When он открыт Then ⚙️ в шапке не показывается', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Page title="Настройки">
          <p>…</p>
        </Page>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Настройки' })).not.toBeInTheDocument();
  });

  it('Given любой экран с Tabs When он отображается на 360 px Then высота каждой вкладки ≥ 44 px (min-h-11)', () => {
    render(
      <MemoryRouter>
        <Tabs
          items={[
            { to: '/', label: 'Сегодня', end: true },
            { to: '/inbox', label: 'Входящие' },
          ]}
        />
      </MemoryRouter>,
    );
    // jsdom has no layout, so the tap-target height is checked via its Tailwind class (min-h-11 = 44 px).
    for (const name of ['Сегодня', 'Входящие']) {
      expect(screen.getByRole('link', { name })).toHaveClass('min-h-11');
    }
  });

  it('Given Segmented When он отображается Then высота каждого варианта ≥ 44 px (min-h-11)', () => {
    render(
      <Segmented
        label="Приоритет"
        value="a"
        onChange={() => {}}
        options={[
          { value: 'a', label: 'P1' },
          { value: 'b', label: 'P2' },
        ]}
      />,
    );
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveClass('min-h-11');
  });

  it('Segmented reports the chosen option', async () => {
    function Demo() {
      const [v, setV] = useState<'a' | 'b'>('a');
      return (
        <Segmented
          label="Режим"
          value={v}
          onChange={setV}
          options={[
            { value: 'a', label: 'А' },
            { value: 'b', label: 'Б' },
          ]}
        />
      );
    }
    render(<Demo />);
    await userEvent.click(screen.getByRole('radio', { name: 'Б' }));
    expect(screen.getByRole('radio', { name: 'Б' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Rating calls onChange with the tapped value', async () => {
    const onChange = vi.fn();
    render(<Rating label="Энергия" value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Энергия: 4' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('Progress exposes value and max to assistive tech', () => {
    render(<Progress label="План дня" value={420} max={360} />);
    const bar = screen.getByRole('progressbar', { name: 'План дня' });
    expect(bar).toHaveAttribute('aria-valuenow', '420');
    expect(bar).toHaveAttribute('aria-valuemax', '360');
  });

  it('Sheet closes on Escape and renders nothing when closed', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open title="Новая задача" onClose={onClose}>
        тело
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    rerender(
      <Sheet open={false} title="Новая задача" onClose={onClose}>
        тело
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
