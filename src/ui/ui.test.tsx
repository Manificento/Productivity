import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Field, Input, Progress, Rating, Segmented, Sheet } from '.';

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
