import type { AppModule } from '../../app/moduleTypes';
import { NutritionPage } from './NutritionPage';

/**
 * «Питание» (SPEC 0.3). A skeleton for the `nutrition` lane: not pinned, reached through «Блоки» and
 * marked «скоро» there; the route works and shows «скоро» until the block has content.
 */
export const nutritionModule: AppModule = {
  id: 'nutrition',
  title: 'Питание',
  path: '/nutrition/*',
  icon: '🥗',
  group: 'body',
  summary: 'Калории, БЖУ и вес',
  comingSoon: true,
  Page: NutritionPage,
};
