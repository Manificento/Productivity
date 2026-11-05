import { useState } from 'react';
import { useDailyTargets } from '../../core/adaptation/useDailyTargets';
import { todayKey } from '../../core/dates';
import { Button, Card, Page, Segmented } from '../../ui';
import { History } from './components/History';
import { Library } from './components/Library';
import { PlanCard } from './components/PlanCard';
import { SessionRunner } from './components/SessionRunner';
import { useMeditationSessions } from './data/sessionStore';
import { guideMinutes, sessionsOfKind, type GuideSession } from './logic/library';
import { DURATIONS_MIN, PATTERNS, type PatternId } from './logic/patterns';

interface Run {
  durationMin: number;
  pattern: PatternId;
  guide?: GuideSession;
}

/** `/meditation` — today's plan, timer with a breathing circle, text guides and a week of history. */
export function MeditationPage() {
  const sessions = useMeditationSessions();
  const targets = useDailyTargets(todayKey());
  const [duration, setDuration] = useState<string>('5');
  const [pattern, setPattern] = useState<PatternId>('4-7-8');
  const [run, setRun] = useState<Run | null>(null);

  if (run) {
    return (
      <Page title="Медитация">
        <Card>
          <SessionRunner
            durationMin={run.durationMin}
            patternId={run.pattern}
            guide={run.guide}
            onClose={() => setRun(null)}
          />
        </Card>
      </Page>
    );
  }
  const startGuide = (g: GuideSession) => setRun({ durationMin: guideMinutes(g), pattern: 'none', guide: g });
  const startPlan = () => {
    if (!targets) return;
    const guide = targets.meditationKind === 'breathing' ? undefined : sessionsOfKind(targets.meditationKind)[0];
    if (guide) startGuide(guide);
    else setRun({ durationMin: targets.meditationMin, pattern: '4-7-8' });
  };
  return (
    <Page title="Медитация">
      {targets && (
        <PlanCard
          minutes={targets.meditationMin}
          kind={targets.meditationKind}
          reasons={targets.reasons}
          onStart={startPlan}
        />
      )}
      <Card title="Новая сессия">
        <Segmented
          label="Длительность"
          value={duration}
          options={DURATIONS_MIN.map((m) => ({ value: String(m), label: `${m} мин` }))}
          onChange={setDuration}
        />
        <Segmented
          label="Паттерн дыхания"
          value={pattern}
          options={PATTERNS.map((p) => ({ value: p.id, label: p.id === 'box' ? 'Коробка 4-4-4-4' : p.title }))}
          onChange={setPattern}
        />
        <Button className="w-full" onClick={() => setRun({ durationMin: Number(duration), pattern })}>
          Начать
        </Button>
      </Card>
      <Library onPick={startGuide} />
      <Card title="История">{sessions && <History sessions={sessions} today={todayKey()} />}</Card>
    </Page>
  );
}
