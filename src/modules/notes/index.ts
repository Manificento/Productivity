import type { AppModule } from '../../app/moduleTypes';
import { NotesPage } from './NotesPage';

/**
 * «Заметки» (SPEC 0.3). A skeleton for the `notes` lane: no `navOrder` yet, so the block is hidden from
 * the bottom navigation until it has something to show; the route works and shows «скоро».
 */
export const notesModule: AppModule = {
  id: 'notes',
  title: 'Заметки',
  path: '/notes/*',
  icon: '📝',
  Page: NotesPage,
};
