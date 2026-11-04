import type { AppModule } from '../../app/moduleTypes';
import { NotesPage } from './NotesPage';

/**
 * «Заметки» (SPEC 0.3). A skeleton for the `notes` lane: not pinned, reached through «Блоки» and
 * marked «скоро» there; the route works and shows «скоро» until the block has content.
 */
export const notesModule: AppModule = {
  id: 'notes',
  title: 'Заметки',
  path: '/notes/*',
  icon: '📝',
  group: 'knowledge',
  summary: 'Заметки со ссылками на проекты и дни',
  comingSoon: true,
  Page: NotesPage,
};
