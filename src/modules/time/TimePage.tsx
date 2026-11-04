import { Route, Routes } from 'react-router-dom';
import { Page, Tabs } from '../../ui';
import { PomodoroView } from './components/PomodoroView';
import { TrackerView } from './components/TrackerView';

export function TimePage() {
  return (
    <Page title="Время">
      <Tabs
        items={[
          { to: '/time', label: 'Таймер', end: true },
          { to: '/time/pomodoro', label: 'Pomodoro' },
        ]}
      />
      <Routes>
        <Route index element={<TrackerView />} />
        <Route path="pomodoro" element={<PomodoroView />} />
      </Routes>
    </Page>
  );
}
