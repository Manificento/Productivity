import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '../../ui';
import { PvtResults, type SaveStatus } from './components/PvtResults';
import { PvtTest } from './components/PvtTest';
import { savePvtResult, type PvtRun } from './data/cognitiveTests';
import { parseDurationParam, safeReturnPath } from './logic/pvt';

/** E2E runs (WebDriver) and the dev server may shorten the test with `?duration=<s>`. */
function isTestMode(): boolean {
  return import.meta.env.DEV || navigator.webdriver === true;
}

/** `/cognition/pvt?return=<path>` — the test, then results; «Готово» goes back to `return`. */
export function PvtPage({ random }: { random?: () => number }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const durationMs = parseDurationParam(params.get('duration'), isTestMode());
  const returnTo = safeReturnPath(params.get('return')) ?? '/cognition';
  const [finished, setFinished] = useState<{ run: PvtRun; status: SaveStatus } | null>(null);

  const onFinish = useCallback((run: PvtRun) => {
    if (run.result.reactionTimesMs.length === 0) {
      setFinished({ run, status: 'noReactions' });
      return;
    }
    setFinished({ run, status: 'saving' });
    savePvtResult(run).then(
      () => setFinished({ run, status: 'saved' }),
      () => setFinished({ run, status: 'error' }),
    );
  }, []);

  return (
    <Page title="Тест внимания">
      {finished ? (
        <PvtResults
          result={finished.run.result}
          status={finished.status}
          onClose={() => navigate(returnTo)}
          onRetry={() => setFinished(null)}
        />
      ) : (
        <PvtTest durationMs={durationMs} random={random} onFinish={onFinish} />
      )}
    </Page>
  );
}
