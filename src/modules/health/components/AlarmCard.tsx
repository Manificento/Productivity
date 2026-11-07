import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { useDailyTargetsRange } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey, toDateKey } from '../../../core/dates';
import { ALARM_TEXTS, getCapabilities, isNativePlatform } from '../../../core/platform';
import type { DateKey, NightSample, SleepLog } from '../../../core/types';
import { Button, Card, Empty, Field, Input, Rating } from '../../../ui';
import { clearDismissal, disableAlarm, enableAlarm, useAlarmState, useDismissal } from '../data/alarm';
import { loadNightSamples, logSleep, nightStages } from '../data/sleep';
import { nextAlarm, sleepOffer, windowLabel } from '../logic/alarm';
import { DEFAULT_QUALITY, stageSummary } from '../logic/sleep';

/** The criterion's wording («доступно в приложении для телефона»), softer than core's `ALARM_TEXTS.web` error hint. */
export const ALARM_WEB_TEXT =
  'Будильник доступен в приложении для телефона: браузер не может разбудить, когда вкладка закрыта.';

/** «Я встал»: last night with the switch-off time as the wake-up, saved through `saveSleep` (`logSleep`). */
function GotUp({
  today,
  dismissal,
  bedtime,
}: {
  today: DateKey;
  dismissal: { dismissedAt: number; alarmAt: number };
  bedtime: string;
}) {
  const offer = sleepOffer(dismissal, bedtime);
  const [open, setOpen] = useState(false);
  const [bed, setBed] = useState(offer.bedtime);
  const [wake, setWake] = useState(offer.wake);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [samples, setSamples] = useState<NightSample[]>([]);

  // The night recorded by «Спать» (#249): saved with stages (#130).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadNightSamples().then((s) => {
      if (alive) setSamples(s);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  // Preview only: the save reads the buffer itself, so a quick tap does not lose the stages.
  const summary = stageSummary(nightStages({ wakeDay: offer.wakeDay, bedtime: bed, wake }, samples));

  async function save() {
    setSaving(true);
    const result = await logSleep(
      { wakeDay: offer.wakeDay, bedtime: bed, wake, quality, fromNightSensing: true },
      today,
    );
    if (result.ok) await clearDismissal();
    else setError(result.error);
    setSaving(false);
  }

  if (!open) {
    return (
      <div
        role="note"
        aria-label="Будильник выключен"
        className="mt-3 rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-950"
      >
        <p className="mb-2 font-medium">Будильник выключен в {offer.wake}. Доброе утро!</p>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setOpen(true)}>Я встал</Button>
          <Button variant="secondary" onClick={() => void clearDismissal()}>
            Не сейчас
          </Button>
        </div>
      </div>
    );
  }
  return (
    <section aria-label="Записать сон" className="mt-3 rounded-xl bg-sky-50 p-3 dark:bg-sky-950">
      <p className="mb-2 text-sm font-medium">Записать прошлую ночь?</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Отбой">
          {(id) => <Input id={id} type="time" value={bed} onChange={(e) => setBed(e.target.value)} />}
        </Field>
        <Field label="Подъём">
          {(id) => <Input id={id} type="time" value={wake} onChange={(e) => setWake(e.target.value)} />}
        </Field>
      </div>
      {summary && <p className="mb-2 text-sm">{summary}</p>}
      <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Качество сна</p>
      <Rating label="Качество сна" value={quality} onChange={setQuality} />
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button disabled={saving} onClick={() => void save()}>
          Записать сон
        </Button>
        <Button variant="secondary" onClick={() => void clearDismissal()}>
          Не сейчас
        </Button>
      </div>
    </section>
  );
}

/** «Будильник» on «Сон» (#129): the wake window from the day's targets, on / off; «Я встал» after it rang. */
export function AlarmCard({ today, recordFor }: { today: DateKey; recordFor: (day: DateKey) => SleepLog | undefined }) {
  const available = getCapabilities().alarms;
  const range = useDailyTargetsRange(shiftDateKey(today, -1), shiftDateKey(today, 1));
  const state = useAlarmState();
  const dismissal = useDismissal();
  const [now] = useState(() => Date.now());
  const [hint, setHint] = useState<string>();
  const staleDismissal = !!dismissal && toDateKey(dismissal.dismissedAt) !== today;
  // A switch-off from an earlier day is not «доброе утро» any more: drop it.
  useEffect(() => {
    if (staleDismissal) clearDismissal().catch((e: unknown) => console.error('clearDismissal failed', e));
  }, [staleDismissal]);
  const [busy, setBusy] = useState(false);

  if (!available) {
    return (
      <Card title="Будильник">
        <Empty>{isNativePlatform() ? ALARM_TEXTS.nativeUnsupported : ALARM_WEB_TEXT}</Empty>
      </Card>
    );
  }
  if (range === undefined || state === undefined || dismissal === null) {
    return (
      <Card title="Будильник">
        <Empty>Загрузка…</Empty>
      </Card>
    );
  }
  const targetsOf = (day: DateKey) => range.find((t) => t.date === day);
  const next = nextAlarm(now, targetsOf, state.lastDismissedAt);
  const wakeTargets = next && targetsOf(next.wakeDay);
  const label = next && wakeTargets && windowLabel(next.wakeDay, wakeTargets.wakeTime, wakeTargets.wakeWindowMin);
  // The night before the switch-off: bedtime target of that evening.
  const offerDay = dismissal ? toDateKey(dismissal.dismissedAt) : undefined;
  const showOffer = dismissal && offerDay === today && !recordFor(offerDay);
  const bedtime = (offerDay && targetsOf(shiftDateKey(offerDay, -1))?.bedtime) ?? targetsOf(today)?.bedtime ?? '23:30';

  async function toggle() {
    setBusy(true);
    setHint(undefined);
    try {
      if (state?.enabled) await disableAlarm();
      else {
        // The screen may have stayed open past a window start: take the next window as of now.
        const upcoming = nextAlarm(Date.now(), targetsOf, state?.lastDismissedAt);
        if (!upcoming) return;
        const result = await enableAlarm(upcoming);
        if (result.status !== 'set') setHint(result.hint);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Будильник">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-zinc-500">Окно подъёма</p>
          <p className="text-2xl font-semibold tabular-nums">{label ?? '—'}</p>
          <p className="text-xs text-zinc-500">
            Каждый день, даже если приложение закрыто. Если перед сном нажать «Спать», будит в лёгкой фазе внутри окна,
            иначе — в его начале.
          </p>
          {state.enabled && state.at !== undefined && !state.error && (
            <p className="mt-1 text-sm">
              Поставлен на {format(state.at, 'd MMMM', { locale: ru })},{' '}
              {format(state.at - (state.windowMin ?? 0) * 60_000, 'H:mm')}–{format(state.at, 'H:mm')}
            </p>
          )}
        </div>
        <Button
          role="switch"
          aria-checked={!!state.enabled}
          aria-label="Будильник"
          disabled={busy || (!state.enabled && !next)}
          variant={state.enabled ? 'primary' : 'secondary'}
          onClick={() => void toggle()}
        >
          {state.enabled ? 'Включён' : 'Выключен'}
        </Button>
      </div>
      {(hint ?? (state.enabled ? state.error : undefined)) && (
        <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {hint ?? state.error} Будильник не зазвонит, пока это не исправлено.
        </p>
      )}
      {showOffer && dismissal && <GotUp today={today} dismissal={dismissal} bedtime={bedtime} />}
    </Card>
  );
}
