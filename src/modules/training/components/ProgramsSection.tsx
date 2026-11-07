import { useEffect, useMemo, useState } from 'react';
import { useDailyTargets, useDailyTargetsRange } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey } from '../../../core/dates';
import type { DateKey, Program } from '../../../core/types';
import { Button, Card, Empty, Sheet } from '../../../ui';
import {
  archiveProgram,
  extendEndedPrograms,
  skipMissedSessions,
  useActivePrograms,
  useTodaySession,
} from '../data/programs';
import { applyCarryOver } from '../data/carry';
import { CARRY_HORIZON_DAYS, CARRY_LOOKBACK_DAYS, type CarryTargets } from '../logic/carry';
import {
  PROGRAM_TEMPLATES,
  WEEKDAY_SHORT,
  draftFromTemplate,
  emptyProgramDraft,
  type ProgramDraft,
} from '../logic/programs';
import { ExtendPlan } from './ExtendPlan';
import { MissedSessions } from './MissedSessions';
import { MuscleBalance } from './MuscleBalance';
import { ProgramForm } from './ProgramForm';
import { PlanOutlook } from './PlanOutlook';
import { SessionRunner } from './SessionRunner';

/** «Программы»: today's session, active programs, templates and the create form. */
export function ProgramsSection({ today }: { today: DateKey }) {
  const programs = useActivePrograms();
  // A session of an earlier day that was not done becomes «пропущена»; the plan is not shifted.
  useEffect(() => {
    skipMissedSessions(today).catch((e: unknown) => console.error('skipMissedSessions failed', e));
  }, [today]);
  // Exercises of missed sessions come back in the next ones (#226), by the targets of the days around today.
  const range = useDailyTargetsRange(
    shiftDateKey(today, -CARRY_LOOKBACK_DAYS),
    shiftDateKey(today, CARRY_HORIZON_DAYS),
  );
  const carryKey = useMemo(
    () => range?.map((t) => `${t.date}:${t.deload ? 1 : 0}:${t.maxWorkoutIntensity}`).join('|'),
    [range],
  );
  useEffect(() => {
    if (!carryKey) return;
    const targets = new Map<string, CarryTargets>(
      carryKey.split('|').map((part) => {
        const [date, deload, intensity] = part.split(':');
        return [
          date!,
          { deload: deload === '1', maxWorkoutIntensity: intensity as CarryTargets['maxWorkoutIntensity'] },
        ];
      }),
    );
    skipMissedSessions(today)
      .then(() => applyCarryOver(today, (date) => targets.get(date)))
      .catch((e: unknown) => console.error('applyCarryOver failed', e));
  }, [today, carryKey]);
  const todaySession = useTodaySession(today);
  const targets = useDailyTargets(today);
  const [draft, setDraft] = useState<ProgramDraft>();
  const [version, setVersion] = useState(0);
  const [archiving, setArchiving] = useState<Program>();
  const [archiveError, setArchiveError] = useState<string>();
  const [extendError, setExtendError] = useState<string>();
  const [extending, setExtending] = useState(false);

  const startDraft = (d: ProgramDraft) => {
    setDraft(d);
    setVersion((v) => v + 1);
  };
  const confirmArchive = async (p: Program) => {
    try {
      await archiveProgram(p.id, today);
      setArchiving(undefined);
      setArchiveError(undefined);
    } catch {
      setArchiveError('Не удалось архивировать — попробуйте ещё раз');
    }
  };

  if (programs === undefined) {
    return (
      <Card title="Программы">
        <Empty>Загрузка…</Empty>
      </Card>
    );
  }

  return (
    <>
      {programs.length > 0 && (
        <Card title="Сегодня">
          {todaySession === null || todaySession === undefined || targets === undefined ? (
            <Empty>Загрузка…</Empty>
          ) : todaySession.rest ? (
            todaySession.ended ? (
              <div className="py-2 text-center">
                <p className="mb-3 text-base font-medium">План завершён</p>
                {extendError && (
                  <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
                    {extendError}
                  </p>
                )}
                <Button
                  disabled={extending}
                  onClick={() => {
                    setExtendError(undefined);
                    setExtending(true);
                    extendEndedPrograms(today)
                      .catch(() => setExtendError('Не удалось продлить план — попробуйте ещё раз'))
                      .finally(() => setExtending(false));
                  }}
                >
                  Продлить план
                </Button>
              </div>
            ) : (
              <p className="py-4 text-center text-base font-medium">День отдыха</p>
            )
          ) : todaySession.session.status === 'done' ? (
            <>
              <p className="mb-2 text-sm text-zinc-500">{todaySession.program.name}</p>
              <p className="py-2 text-base font-medium text-emerald-700 dark:text-emerald-400">
                Тренировка выполнена ✓
              </p>
            </>
          ) : (
            <SessionRunner
              key={`${todaySession.session.id}:${todaySession.session.exercises.length}`}
              program={todaySession.program}
              session={todaySession.session}
              targets={targets}
            />
          )}
        </Card>
      )}

      {programs.length > 0 && <MissedSessions today={today} />}
      {programs.length > 0 && <ExtendPlan today={today} />}
      {programs.length > 0 && <PlanOutlook today={today} />}
      {programs.length > 0 && <MuscleBalance today={today} />}

      {draft && (
        <ProgramForm
          key={version}
          today={today}
          initial={draft}
          onSaved={() => setDraft(undefined)}
          onCancel={() => setDraft(undefined)}
        />
      )}

      {!draft && (
        <Card title="Программы">
          {programs.length === 0 ? (
            <Empty>Программ пока нет — выберите шаблон или создайте свою</Empty>
          ) : (
            <ul aria-label="Программы" className="mb-3">
              {programs.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-zinc-500">
                      {p.days.map((d) => WEEKDAY_SHORT[d.weekday]).join(', ')} · {p.weeks} нед.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    aria-label={`Архивировать ${p.name}`}
                    onClick={() => {
                      setArchiving(p);
                      setArchiveError(undefined);
                    }}
                  >
                    Архив
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2">
            <Button onClick={() => startDraft(emptyProgramDraft())}>Создать программу</Button>
            {PROGRAM_TEMPLATES.map((t) => (
              <Button key={t.name} variant="secondary" onClick={() => startDraft(draftFromTemplate(t))}>
                Шаблон: {t.name}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <Sheet open={archiving !== undefined} title="Архивировать программу?" onClose={() => setArchiving(undefined)}>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Будущие занятия «{archiving?.name}» исчезнут из плана, журнал тренировок не изменится.
        </p>
        {archiveError && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {archiveError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setArchiving(undefined)}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => archiving && void confirmArchive(archiving)}>
            Архивировать
          </Button>
        </div>
      </Sheet>
    </>
  );
}
