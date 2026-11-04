import type { AppModule } from '../../app/moduleTypes';
import { PomodoroBackground } from './components/PomodoroBackground';
import { TimePage } from './TimePage';

export const timeModule: AppModule = {
  id: 'time',
  title: 'Время',
  path: '/time/*',
  icon: '⏱️',
  navOrder: 4,
  Page: TimePage,
  Background: PomodoroBackground,
};
