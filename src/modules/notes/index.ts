import type { AppModule } from '../../app/moduleTypes';
import { NotesPage } from './NotesPage';

/**
 * «Заметки» (SPEC 0.3). Markdown notes linked to projects, events and days; not pinned, reached through «Блоки».
 */
export const notesModule: AppModule = {
  id: 'notes',
  title: 'Заметки',
  path: '/notes/*',
  icon: '📝',
  group: 'knowledge',
  summary: 'Заметки со ссылками на проекты и дни',
  Page: NotesPage,
};
