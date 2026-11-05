import { useEffect, useState, type FormEvent } from 'react';
import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { todayKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Card, Empty, Field, Input, Segmented, Select } from '../../../ui';
import { refreshExpenditure, saveGoal, saveProfile, useEstimateInputs, useGoal } from '../data/goal';
import { RATE_OPTIONS, parseProfile, type Estimate, type Profile } from '../logic/expenditure';
import { formatGrams } from '../logic/nutrition';

type Kind = 'lose' | 'maintain' | 'gain';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'lose', label: 'Снизить' },
  { value: 'maintain', label: 'Удержать' },
  { value: 'gain', label: 'Набрать' },
];

const rateLabel = (r: number) => `${formatGrams(r)} % в неделю`;

function ProfileForm({ profile, today, onSaved }: { profile?: Profile; today: DateKey; onSaved: () => void }) {
  const [heightCm, setHeight] = useState(profile ? String(profile.heightCm) : '');
  const [birthYear, setYear] = useState(profile ? String(profile.birthYear) : '');
  const [sex, setSex] = useState<Profile['sex']>(profile?.sex ?? 'male');
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseProfile({ heightCm, birthYear, sex }, Number(today.slice(0, 4)));
    if (!parsed.ok) return setError(parsed.error);
    setError(undefined);
    try {
      await saveProfile(parsed.value);
      onSaved();
    } catch {
      setError('Не удалось сохранить — попробуйте ещё раз');
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3" aria-label="Данные для стартовой оценки">
      <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
        Для стартовой оценки расхода нужны рост, год рождения и пол — они нигде больше не используются.
      </p>
      <Field label="Рост, см">
        {(id) => <Input id={id} inputMode="numeric" value={heightCm} onChange={(e) => setHeight(e.target.value)} />}
      </Field>
      <Field label="Год рождения">
        {(id) => <Input id={id} inputMode="numeric" value={birthYear} onChange={(e) => setYear(e.target.value)} />}
      </Field>
      <Segmented
        label="Пол"
        value={sex}
        options={[
          { value: 'male', label: 'Мужской' },
          { value: 'female', label: 'Женский' },
        ]}
        onChange={setSex}
      />
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full">
        Сохранить данные
      </Button>
    </form>
  );
}

/** «Цель»: goal and rate, starter/measured expenditure, and the day's calorie and macro targets from the engine. */
export function GoalCard({ today = todayKey() }: { today?: DateKey }) {
  const settings = useGoal();
  const targets = useDailyTargets(today);
  const [estimate, setEstimate] = useState<Estimate>();
  const [kind, setKind] = useState<Kind>();
  const [rate, setRate] = useState<number>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [profileRev, setProfileRev] = useState(0);

  const inputs = useEstimateInputs(today);

  // Recompute when the screen opens and whenever the profile, weights or diary change (stored at most weekly once measured).
  useEffect(() => {
    let alive = true;
    refreshExpenditure(today).then(
      (e) => alive && setEstimate(e),
      () => alive && setEstimate(undefined),
    );
    return () => {
      alive = false;
    };
  }, [today, profileRev, inputs]);

  if (!settings) return <Empty>Загрузка…</Empty>;

  const currentKind = kind ?? settings.goal?.kind ?? 'lose';
  const savedRate = settings.goal?.ratePct;
  // A saved rate outside the options (0 for «удержать», or from an imported backup) would not match what the select shows.
  const currentRate = rate ?? (RATE_OPTIONS.some((r) => r === savedRate) ? (savedRate as number) : 0.5);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      await saveGoal({ kind: currentKind, ratePct: currentKind === 'maintain' ? 0 : currentRate });
      setError(undefined);
      setSaved(true);
    } catch {
      setError('Не удалось сохранить цель — попробуйте ещё раз');
    }
  }

  const hasTargets = targets?.kcal !== undefined;
  // The label follows what the engine uses (the stored value), the countdown follows the fresh estimate.
  const starter = estimate?.kind === 'starter' && settings.expenditure?.source === 'starter' ? estimate : undefined;

  return (
    <section aria-label="Цель">
      <Card title="Цель">
        <form onSubmit={onSubmit} noValidate>
          <Segmented
            label="Цель по весу"
            value={currentKind}
            options={KINDS}
            onChange={(k) => {
              setKind(k);
              setSaved(false);
            }}
          />
          {currentKind !== 'maintain' && (
            <Field label="Темп">
              {(id) => (
                <Select
                  id={id}
                  value={String(currentRate)}
                  onChange={(e) => {
                    setRate(Number(e.target.value));
                    setSaved(false);
                  }}
                >
                  {RATE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {rateLabel(r)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {error && (
            <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">
              Цель сохранена
            </p>
          )}
          <Button type="submit" className="w-full">
            Сохранить цель
          </Button>
        </form>

        {hasTargets && targets ? (
          <div className="mt-4" aria-label="Цели дня по питанию" role="group">
            <p className="text-lg font-semibold tabular-nums">{formatGrams(targets.kcal ?? 0)} ккал</p>
            <p className="text-sm tabular-nums">
              Б {formatGrams(targets.proteinG ?? 0)} · Ж {formatGrams(targets.fatG ?? 0)} · У{' '}
              {formatGrams(targets.carbsG ?? 0)} г
            </p>
            {starter && (
              <p className="mt-1 text-sm text-zinc-500">
                Стартовая оценка расхода (Mifflin–St Jeor), уточним через {starter.daysLeft}{' '}
                {starter.daysLeft === 1 ? 'день' : starter.daysLeft < 5 ? 'дня' : 'дней'}
              </p>
            )}
            {(targets.phase === 'taper' || targets.phase === 'event') && (
              <ul
                aria-label="Почему такие цели"
                className="mt-2 list-disc pl-5 text-sm text-amber-700 dark:text-amber-400"
              >
                {targets.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            Цели по калориям появятся, когда будут заданы цель, вес и стартовые данные.
          </p>
        )}

        {estimate?.kind !== 'measured' && (
          <ProfileForm
            key={settings.profile ? 'saved' : 'new'}
            profile={settings.profile}
            today={today}
            onSaved={() => setProfileRev((n) => n + 1)}
          />
        )}
      </Card>
    </section>
  );
}
