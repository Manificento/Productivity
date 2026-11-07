import { useState, type FormEvent } from 'react';
import { todayKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Card, Empty, Field, Input } from '../../../ui';
import { logWeight, useWeightLogs } from '../data/weight';
import {
  CHART_DAYS,
  TREND_MIN_ENTRIES,
  formatKg,
  lastDays,
  parseKg,
  trendSeries,
  validateKg,
  weeklyChange,
} from '../logic/trend';
import { WeightChart } from './WeightChart';

/** «Вес»: quick input for today and the trend chart. */
export function WeightCard({ today = todayKey() }: { today?: DateKey }) {
  const logs = useWeightLogs();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [allHistory, setAllHistory] = useState(false);

  if (!logs) return <Empty>Загрузка…</Empty>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(undefined);
    const kg = parseKg(text);
    const invalid = validateKg(kg);
    if (invalid || kg === undefined) {
      setError(invalid);
      return;
    }
    setError(undefined);
    try {
      await logWeight(today, kg);
    } catch {
      setError('Не удалось сохранить вес — попробуйте ещё раз');
      return;
    }
    setText('');
    setSaved(`Записано: ${formatKg(kg)} кг`);
  }

  const series = trendSeries(logs);
  const recent = lastDays(series, today);
  const hasOlder = recent.length < series.length;
  const visible = allHistory || !hasOlder ? series : recent;
  const showTrend = series.length >= TREND_MIN_ENTRIES;
  const raw = showTrend ? weeklyChange(series) : undefined;
  const change = raw === undefined ? undefined : Math.round(raw * 10) / 10;

  return (
    <section aria-label="Вес">
      <Card title="Вес">
        <form onSubmit={onSubmit} noValidate>
          <Field label="Вес, кг" error={error}>
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="72,4"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setSaved(undefined);
                }}
              />
            )}
          </Field>
          {saved && (
            <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">
              {saved}
            </p>
          )}
          <Button type="submit" className="w-full">
            Записать
          </Button>
        </form>
        {series.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Записей веса пока нет — внесите первый, чтобы увидеть тренд.</p>
        ) : (
          <div className="mt-3">
            {visible.length > 0 ? (
              <WeightChart series={visible} today={today} showTrend={showTrend} />
            ) : (
              <p className="text-sm text-zinc-500">За последние {CHART_DAYS} дней записей нет.</p>
            )}
            {hasOlder && (
              <Button variant="secondary" className="mt-2 w-full" onClick={() => setAllHistory((v) => !v)}>
                {allHistory ? `Последние ${CHART_DAYS} дней` : 'Вся история'}
              </Button>
            )}
            {showTrend ? (
              change !== undefined && (
                <p className="text-sm">
                  Изменение за неделю:{' '}
                  <strong>{`${change > 0 ? '+' : change < 0 ? '−' : ''}${formatKg(Math.abs(change))} кг`}</strong>
                </p>
              )
            ) : (
              <p className="text-sm text-zinc-500">
                Тренд появится после {TREND_MIN_ENTRIES} записей (сейчас {series.length}).
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
