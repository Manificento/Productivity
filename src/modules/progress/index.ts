import type { AppModule } from '../../app/moduleTypes';
import { ProgressPage } from './ProgressPage';

/**
 * «Прогресс» (SPEC 0.3). Опыт и уровни по данным всех блоков; не закреплён в нижней панели, открывается через «Блоки».
 */
export const progressModule: AppModule = {
  id: 'progress',
  title: 'Прогресс',
  path: '/progress/*',
  icon: '🏆',
  group: 'system',
  summary: 'Опыт, уровни и квесты',
  Page: ProgressPage,
};
