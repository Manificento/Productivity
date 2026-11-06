import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Page } from '../../ui';
import { MindResult, type MindSaveStatus } from './components/MindResult';
import { NbackTrainer, type NbackFinish } from './components/NbackTrainer';
import { saveNbackSession, useNbackSessions } from './data/mindSessions';
import { compareToAverage, comparisonText } from './logic/summary';
import { nextLevel, parseNbackDurationParam } from './logic/nback';

type SaveStatus = MindSaveStatus;

function isTestMode(): boolean {
  return import.meta.env.DEV || navigator.webdriver === true;
}

/** `/cognition/nback` — instruction, the 3-minute session, results. */
export function NbackPage({ random }: { random?: () => number }) {
  const [params] = useSearchParams();
  const durationMs = parseNbackDurationParam(params.get('duration'), isTestMode());
  const sessions = useNbackSessions();
  const [finished, setFinished] = useState<{
    run: NbackFinish;
    status: SaveStatus;
    next?: number;
    comparison?: string;
  } | null>(null);

  const onFinish = useCallback(
    (run: NbackFinish) => {
      setFinished({ run, status: 'saving' });
      saveNbackSession(run).then(
        (saved) =>
          setFinished({
            run,
            status: 'saved',
            next: nextLevel([...(sessions ?? []), saved]),
            comparison: comparisonText(
              compareToAverage(
                run.accuracyPct,
                (sessions ?? []).map((x) => x.accuracyPct),
                false,
              ),
              (v) => `${Math.round(v)}%`,
            ),
          }),
        () => setFinished({ run, status: 'error' }),
      );
    },
    [sessions],
  );

  if (sessions === undefined) {
    return (
      <Page title="n-back">
        <Empty>Загружаю…</Empty>
      </Page>
    );
  }

  if (finished) {
    const { run, status, next, comparison } = finished;
    const levelNote =
      next === undefined
        ? ''
        : next > run.level
          ? ` Отлично! Следующая сессия — n = ${next}.`
          : next < run.level
            ? ` Следующая сессия — легче: n = ${next}.`
            : ` Следующая сессия — n = ${next}.`;
    return (
      <Page title="n-back">
        <MindResult
          rows={[
            ['Уровень', `n = ${run.level}`],
            ['Точность', `${run.accuracyPct}%`],
            ['Среднее время реакции', run.meanRtMs === undefined ? '—' : `${run.meanRtMs} мс`],
            ['Ошибки', String(run.errors)],
          ]}
          status={status}
          comparison={comparison === undefined ? undefined : comparison + levelNote}
          onRetry={() => setFinished(null)}
        />
      </Page>
    );
  }

  return (
    <Page title="n-back">
      <NbackTrainer level={nextLevel(sessions)} durationMs={durationMs} random={random} onFinish={onFinish} />
    </Page>
  );
}
