import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Page } from '../../ui';
import { MindResult, type MindSaveStatus } from './components/MindResult';
import { StroopTrainer, type StroopFinish } from './components/StroopTrainer';
import { saveStroopSession, useMindSessions } from './data/mindSessions';
import { parseStroopDurationParam } from './logic/stroop';
import { compareToAverage, comparisonText } from './logic/summary';

function isTestMode(): boolean {
  return import.meta.env.DEV || navigator.webdriver === true;
}

/** `/cognition/stroop` — instruction, 60 s session, summary. */
export function StroopPage({ random }: { random?: () => number }) {
  const [params] = useSearchParams();
  const durationMs = parseStroopDurationParam(params.get('duration'), isTestMode());
  const sessions = useMindSessions('stroop');
  const [finished, setFinished] = useState<{ run: StroopFinish; status: MindSaveStatus; comparison?: string } | null>(
    null,
  );

  const onFinish = useCallback(
    (run: StroopFinish) => {
      if (run.trials === 0) {
        setFinished({ run, status: 'empty' });
        return;
      }
      setFinished({ run, status: 'saving' });
      const earlier = (sessions ?? []).flatMap((x) => (x.meanRtMs === undefined ? [] : [x.meanRtMs]));
      saveStroopSession(run).then(
        () =>
          setFinished({
            run,
            status: 'saved',
            comparison:
              run.meanRtMs === undefined
                ? comparisonText(
                    compareToAverage(
                      run.accuracyPct,
                      (sessions ?? []).map((x) => x.accuracyPct),
                      false,
                    ),
                    (v) => `${Math.round(v)}%`,
                  )
                : comparisonText(compareToAverage(run.meanRtMs, earlier, true), (v) => `${Math.round(v)} мс`),
          }),
        () => setFinished({ run, status: 'error' }),
      );
    },
    [sessions],
  );

  if (sessions === undefined)
    return (
      <Page title="Струп">
        <Empty>Загружаю…</Empty>
      </Page>
    );

  if (finished) {
    const { run, status, comparison } = finished;
    return (
      <Page title="Струп">
        <MindResult
          rows={[
            ['Точность', `${run.accuracyPct}%`],
            ['Среднее время реакции', run.meanRtMs === undefined ? '—' : `${run.meanRtMs} мс`],
            ['Эффект интерференции', run.interferenceMs === undefined ? '—' : `${run.interferenceMs} мс`],
            ['Ошибки', String(run.errors)],
          ]}
          status={status}
          comparison={comparison}
          onRetry={() => setFinished(null)}
        />
        <p className="mt-3 text-xs text-zinc-500">
          Эффект интерференции — насколько дольше вы отвечаете, когда слово и цвет не совпадают. Меньше — лучше.
        </p>
      </Page>
    );
  }

  return (
    <Page title="Струп">
      <StroopTrainer durationMs={durationMs} random={random} onFinish={onFinish} />
    </Page>
  );
}
