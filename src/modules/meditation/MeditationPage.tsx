import { useState } from 'react';
import { todayKey } from '../../core/dates';
import { Button, Card, Page, Segmented } from '../../ui';
import { History } from './components/History';
import { SessionRunner } from './components/SessionRunner';
import { useMeditationSessions } from './data/sessionStore';
import { DURATIONS_MIN, PATTERNS, type PatternId } from './logic/patterns';

/** `/meditation` — timer with a breathing circle, and a week of history with the streak. */
export function MeditationPage() {
  const sessions = useMeditationSessions();
  const [duration, setDuration] = useState<string>('5');
  const [pattern, setPattern] = useState<PatternId>('4-7-8');
  const [running, setRunning] = useState(false);

  if (running) {
    return (
      <Page title="Медитация">
        <Card>
          <SessionRunner durationMin={Number(duration)} patternId={pattern} onClose={() => setRunning(false)} />
        </Card>
      </Page>
    );
  }
  return (
    <Page title="Медитация">
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
          options={PATTERNS.map((p) => ({ value: p.id, label: p.title }))}
          onChange={setPattern}
        />
        <Button className="w-full" onClick={() => setRunning(true)}>
          Начать
        </Button>
      </Card>
      <Card title="История">{sessions && <History sessions={sessions} today={todayKey()} />}</Card>
    </Page>
  );
}
