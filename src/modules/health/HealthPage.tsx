import { Route, Routes } from 'react-router-dom';
import { ComingSoon, Page, Tabs } from '../../ui';
import { SleepTab } from './SleepTab';

export function HealthPage() {
  return (
    <Page title="Здоровье">
      <Tabs
        items={[
          { to: '/health', label: 'Сон', end: true },
          { to: '/health/food', label: 'Еда' },
          { to: '/health/workouts', label: 'Тренировки' },
        ]}
      />
      <Routes>
        <Route index element={<SleepTab />} />
        <Route path="food" element={<ComingSoon what="Еда" />} />
        <Route path="workouts" element={<ComingSoon what="Тренировки" />} />
        <Route path="*" element={<SleepTab />} />
      </Routes>
    </Page>
  );
}
