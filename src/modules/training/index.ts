import type { AppModule } from '../../app/moduleTypes';
import { TrainingPage } from './TrainingPage';

/** «Тренировки»: the workout log and its forms (moved from health, #107). */
export const trainingModule: AppModule = {
  id: 'training',
  title: 'Тренировки',
  path: '/training/*',
  icon: '🏋️',
  group: 'body',
  summary: 'Программы, план на сегодня и журнал тренировок',
  Page: TrainingPage,
};
