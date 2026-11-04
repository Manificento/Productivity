import { Route, Routes } from 'react-router-dom';
import { Page, Tabs } from '../../ui';
import { InboxView } from './components/InboxView';
import { ProjectsView } from './components/ProjectsView';
import { ProjectView } from './components/ProjectView';
import { TodayView } from './components/TodayView';
import { UpcomingView } from './components/UpcomingView';

const TABS = [
  { to: '/tasks', label: 'Сегодня', end: true },
  { to: '/tasks/upcoming', label: 'Предстоящие' },
  { to: '/tasks/inbox', label: 'Входящие' },
  { to: '/tasks/projects', label: 'Проекты' },
];

export function TasksPage() {
  return (
    <Page title="Задачи">
      <Tabs items={TABS} />
      <Routes>
        <Route index element={<TodayView />} />
        <Route path="upcoming" element={<UpcomingView />} />
        <Route path="inbox" element={<InboxView />} />
        <Route path="projects" element={<ProjectsView />} />
        <Route path="projects/:projectId" element={<ProjectView />} />
      </Routes>
    </Page>
  );
}
