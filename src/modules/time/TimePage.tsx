import { Route, Routes } from 'react-router-dom';
import { Page, Tabs } from '../../ui';
import { BalanceView } from './components/BalanceView';
import { PomodoroView } from './components/PomodoroView';
import { TrackerView } from './components/TrackerView';
import { usePomodoro } from './components/usePomodoro';
import { remainingMs } from './logic/pomodoro';
import { formatDuration } from './logic/timer';

export function TimePage() {
  // The timer is shared (pomodoroRuntime) and also kept running on other pages by PomodoroBackground;
  // read here so the «Таймер» tab can show the running focus session.
  const pomodoro = usePomodoro();
  const { state } = pomodoro;
  const focus =
    state.status === 'running'
      ? {
          phase: state.phase === 'work' ? 'фокус' : 'перерыв',
          left: formatDuration(Math.ceil(remainingMs(state, pomodoro.now) / 1000) * 1000),
          stop: pomodoro.stop,
        }
      : undefined;

  return (
    <Page title="Время">
      <Tabs
        items={[
          { to: '/time', label: 'Таймер', end: true },
          { to: '/time/pomodoro', label: 'Pomodoro' },
          { to: '/time/balance', label: 'Баланс' },
        ]}
      />
      <Routes>
        <Route index element={<TrackerView focus={focus} />} />
        <Route path="pomodoro" element={<PomodoroView pomodoro={pomodoro} />} />
        <Route path="balance" element={<BalanceView />} />
      </Routes>
    </Page>
  );
}
