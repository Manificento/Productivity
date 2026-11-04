import type { AppModule } from '../../app/moduleTypes';
import { TimePage } from './TimePage';

export const timeModule: AppModule = {
  id: 'time',
  title: 'Время',
  path: '/time/*',
  icon: '⏱️',
  navOrder: 4,
  Page: TimePage,
};
