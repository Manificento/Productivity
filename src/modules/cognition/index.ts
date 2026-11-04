import type { AppModule } from '../../app/moduleTypes';
import { CognitionPage } from './CognitionPage';

/**
 * Cognitive tests. Not in the bottom navigation: reached from the morning flow on «Сегодня»
 * (`/cognition/pvt?return=/`) and from links in other screens.
 */
export const cognitionModule: AppModule = {
  id: 'cognition',
  title: 'Тесты',
  path: '/cognition/*',
  icon: '🧠',
  group: 'mind',
  summary: 'Тест внимания и тренажёры ума',
  Page: CognitionPage,
};
