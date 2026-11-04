import type { AppModule } from '../../app/moduleTypes';
import { PomodoroBackground } from './components/PomodoroBackground';
import { TimePage } from './TimePage';

export const timeModule: AppModule = {
  id: 'time',
  title: 'Время',
  path: '/time/*',
  icon: '⏱️',
  group: 'plan',
  summary: 'Таймер, Pomodoro и баланс времени',
  navOrder: 4,
  Page: TimePage,
  Background: PomodoroBackground,
};
