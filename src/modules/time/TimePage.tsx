import { Route, Routes } from 'react-router-dom';
import { Page, Tabs } from '../../ui';
import { PomodoroView } from './components/PomodoroView';
import { TrackerView } from './components/TrackerView';
import { usePomodoro } from './components/usePomodoro';
import { remainingMs } from './logic/pomodoro';
import { formatDuration } from './logic/timer';

export function TimePage() {
  // Lives here, not in PomodoroView, so a focus session keeps ticking (and gets recorded and signalled)
  // while the user is on the «Таймер» tab.
  const pomodoro = usePomodoro();
  const { state } = pomodoro;
  const focus =
    state.status === 'running' && state.phase === 'work'
      ? { left: formatDuration(Math.ceil(remainingMs(state, pomodoro.now) / 1000) * 1000), stop: pomodoro.stop }
      : undefined;

  return (
    <Page title="Время">
      <Tabs
        items={[
          { to: '/time', label: 'Таймер', end: true },
          { to: '/time/pomodoro', label: 'Pomodoro' },
        ]}
      />
      <Routes>
        <Route index element={<TrackerView focus={focus} />} />
        <Route path="pomodoro" element={<PomodoroView pomodoro={pomodoro} />} />
      </Routes>
    </Page>
  );
}
