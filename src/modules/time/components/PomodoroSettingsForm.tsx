import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '../../../ui';
import { parsePomodoroSettings, type PomodoroSettings, type SettingsInput } from '../logic/pomodoro';

const FIELDS: { key: keyof PomodoroSettings; label: string }[] = [
  { key: 'workMin', label: 'Фокус, мин' },
  { key: 'shortBreakMin', label: 'Короткий перерыв, мин' },
  { key: 'longBreakMin', label: 'Длинный перерыв, мин' },
  { key: 'sessionsBeforeLongBreak', label: 'Сессий до длинного перерыва' },
];

export function PomodoroSettingsForm({
  settings,
  onSave,
}: {
  settings: PomodoroSettings;
  onSave: (settings: PomodoroSettings) => void;
}) {
  const [values, setValues] = useState<SettingsInput>(() => ({
    workMin: String(settings.workMin),
    shortBreakMin: String(settings.shortBreakMin),
    longBreakMin: String(settings.longBreakMin),
    sessionsBeforeLongBreak: String(settings.sessionsBeforeLongBreak),
  }));
  const [error, setError] = useState<{ field: keyof PomodoroSettings; text: string }>();

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parsePomodoroSettings(values);
    if (!parsed.ok) {
      setError({ field: parsed.field, text: parsed.error });
      return;
    }
    setError(undefined);
    onSave(parsed.value);
  }

  return (
    <form onSubmit={submit} noValidate>
      {FIELDS.map(({ key, label }) => (
        <Field key={key} label={label} error={error?.field === key ? error.text : undefined}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              value={values[key]}
              aria-invalid={error?.field === key}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      <p className="mb-3 text-sm text-zinc-500">Новые значения применятся со следующей сессии.</p>
      <Button type="submit" className="w-full">
        Сохранить
      </Button>
    </form>
  );
}
