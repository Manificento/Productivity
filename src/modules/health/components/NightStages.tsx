import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { getCapabilities } from '../../../core/platform';
import { sleepStages } from '../../../core/sleepPhases';
import type { SleepLog, SleepStage } from '../../../core/types';
import { Button, Card } from '../../../ui';
import { addStagesFromSensing, loadNightSamples } from '../data/sleep';
import { stageSummary } from '../logic/sleep';

const STAGE_STYLE: Record<SleepStage['stage'], { label: string; className: string }> = {
  deep: { label: 'глубокий', className: 'bg-indigo-700 dark:bg-indigo-500' },
  light: { label: 'лёгкий', className: 'bg-sky-400 dark:bg-sky-300' },
  rem: { label: 'быстрый', className: 'bg-violet-400 dark:bg-violet-300' },
  awake: { label: 'без сна', className: 'bg-amber-400 dark:bg-amber-300' },
};

/** A bar of the night from bedtime to wake-up, one segment per stage, widths by time. */
function StageBar({ log, stages }: { log: SleepLog; stages: SleepStage[] }) {
  const total = log.wakeTime - log.bedtime;
  return (
    <div
      role="img"
      aria-label={`Этапы сна с ${format(log.bedtime, 'H:mm')} до ${format(log.wakeTime, 'H:mm')}: ${stageSummary(stages)}`}
      className="relative h-4 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
    >
      {/* Placed by time: before the recording started or in its gaps the bar stays grey. */}
      {stages.map((s) => (
        <span
          key={s.start}
          title={STAGE_STYLE[s.stage].label}
          className={`absolute inset-y-0 ${STAGE_STYLE[s.stage].className}`}
          style={{
            left: `${((s.start - log.bedtime) / total) * 100}%`,
            width: `${((s.end - s.start) / total) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * «Этапы прошлой ночи» (#255): the saved night's stages — a summary and a bar; for a night saved without «Я встал»
 * (morning flow, import) whose recording is still in the buffer, «Добавить этапы из записи ночи».
 */
export function NightStages({ lastNight }: { lastNight?: SleepLog }) {
  const [canAdd, setCanAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const sensing = getCapabilities().backgroundSensors;
  const stages = lastNight?.stages ?? [];
  const id = lastNight?.id;
  const bedtime = lastNight?.bedtime;
  const wakeTime = lastNight?.wakeTime;

  useEffect(() => {
    setCanAdd(false);
    if (!sensing || id === undefined || bedtime === undefined || wakeTime === undefined || stages.length > 0) return;
    let alive = true;
    void loadNightSamples().then((samples) => {
      if (alive) setCanAdd(sleepStages(samples, bedtime, wakeTime).length > 0);
    });
    return () => {
      alive = false;
    };
  }, [sensing, id, bedtime, wakeTime, stages.length]);

  if (!lastNight || (stages.length === 0 && !canAdd)) return null;

  async function add() {
    if (!lastNight) return;
    setBusy(true);
    setError(undefined);
    try {
      if ((await addStagesFromSensing(lastNight)) === 0) setError('В записи ночи нет данных за эту ночь');
    } catch {
      setError('Не удалось добавить этапы — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Этапы прошлой ночи">
      <Card title="Этапы прошлой ночи">
        {stages.length > 0 ? (
          <>
            <p className="mb-2 text-sm">{stageSummary(stages)}</p>
            <StageBar log={lastNight} stages={stages} />
            <ul className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-400" aria-hidden="true">
              {(['deep', 'light', 'rem', 'awake'] as const)
                .filter((s) => stages.some((x) => x.stage === s))
                .map((s) => (
                  <li key={s} className="flex items-center gap-1">
                    <span className={`inline-block size-2.5 rounded-full ${STAGE_STYLE[s].className}`} />
                    {STAGE_STYLE[s].label}
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Ночь записана без этапов, но телефон записал её датчиками.
            </p>
            <Button className="w-full" disabled={busy} onClick={() => void add()}>
              Добавить этапы из записи ночи
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </Card>
    </section>
  );
}
