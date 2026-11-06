import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import type { LifeEvent, Note, Project } from '../../core/types';
import { NotesPage } from './NotesPage';

const renderNotes = () =>
  render(
    <MemoryRouter>
      <NotesPage />
    </MemoryRouter>,
  );

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.projects.clear(), db.lifeEvents.clear()]);
});

describe('NotesPage', () => {
  it('Given пустой блок When я открываю «Заметки» Then пустое состояние и «Новая заметка»', async () => {
    renderNotes();
    expect(await screen.findByText(/Заметок пока нет/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новая заметка' })).toBeInTheDocument();
  });

  it('Given я пишу текст с markdown When выхожу из редактора Then заметка сохранена автоматически; предпросмотр с заголовками, списками и чекбоксами', async () => {
    const user = userEvent.setup();
    renderNotes();
    await user.click(await screen.findByRole('button', { name: 'Новая заметка' }));
    await user.type(await screen.findByLabelText('Название'), 'Экзамен');
    await user.click(screen.getByLabelText('Текст заметки'));
    await user.paste('# План\n- [x] паспорт\n- [ ] билет');
    await user.click(screen.getByRole('button', { name: 'Предпросмотр' }));

    const preview = screen.getByLabelText('Предпросмотр заметки');
    expect(preview.querySelector('h2')).toHaveTextContent('План');
    expect(preview.querySelectorAll('li')).toHaveLength(2);
    expect(preview.querySelectorAll('input[type=checkbox]:checked')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Готово' }));
    const [saved] = await db.notes.toArray();
    expect(saved).toMatchObject({ title: 'Экзамен', body: '# План\n- [x] паспорт\n- [ ] билет' });
    expect(await screen.findByText('Экзамен')).toBeInTheDocument();
  });

  it('Given заметка When я привязываю её к проекту, событию или дню Then ссылка в linkIds; в блоке есть фильтр «по событию» и «по проекту»', async () => {
    const user = userEvent.setup();
    const project: Project = { ...newRecord({ name: 'Химия', archived: false }, 1) };
    const event: LifeEvent = {
      ...newRecord(
        { title: 'Зачёт', type: 'exam' as const, date: '2026-12-01', importance: 2 as const, prepDays: 7 },
        1,
      ),
    };
    const note: Note = { ...newRecord({ title: 'Подготовка', body: '', linkIds: [] as string[] }, 1) };
    const other: Note = { ...newRecord({ title: 'Идеи', body: '', linkIds: [] as string[] }, 2) };
    await Promise.all([db.projects.add(project), db.lifeEvents.add(event), db.notes.bulkAdd([note, other])]);
    renderNotes();

    await user.click(await screen.findByRole('button', { name: /Подготовка/ }));
    await user.click(await screen.findByLabelText('Проект: Химия'));
    await user.click(screen.getByLabelText('Событие: Зачёт'));
    await user.type(screen.getByLabelText('Привязать день'), '2026-11-30');
    await user.click(screen.getByRole('button', { name: 'Привязать' }));
    await waitFor(async () =>
      expect((await db.notes.get(note.id))?.linkIds.sort()).toEqual([event.id, project.id, '2026-11-30'].sort()),
    );
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    await user.selectOptions(await screen.findByLabelText('По проекту'), project.id);
    expect(screen.getByText('Подготовка')).toBeInTheDocument();
    expect(screen.queryByText('Идеи')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('По проекту'), '');
    await user.selectOptions(screen.getByLabelText('По событию'), event.id);
    expect(screen.getByText('Подготовка')).toBeInTheDocument();
    expect(screen.queryByText('Идеи')).not.toBeInTheDocument();
  });

  it('Given я набрал текст When ухожу со страницы без «Готово» Then заметка всё равно сохранена', async () => {
    const user = userEvent.setup();
    const { unmount } = renderNotes();
    await user.click(await screen.findByRole('button', { name: 'Новая заметка' }));
    await user.type(await screen.findByLabelText('Название'), 'Черновик');
    unmount();
    await waitFor(async () => expect((await db.notes.toArray())[0]?.title).toBe('Черновик'));
  });

  it('Given новая заметка без текста When нажимаю «Готово» Then пустая заметка не остаётся в списке', async () => {
    const user = userEvent.setup();
    renderNotes();
    await user.click(await screen.findByRole('button', { name: 'Новая заметка' }));
    await user.click(await screen.findByRole('button', { name: 'Готово' }));
    expect(await screen.findByText(/Заметок пока нет/)).toBeInTheDocument();
    expect(await db.notes.count()).toBe(0);
  });

  it('Given список заметок When я ищу по слову Then фильтр по заголовку и тексту без учёта регистра', async () => {
    const user = userEvent.setup();
    await db.notes.bulkAdd([
      { ...newRecord({ title: 'Билеты', body: 'Купить ПАСПОРТ', linkIds: [] as string[] }, 1) },
      { ...newRecord({ title: 'Идеи', body: 'ничего', linkIds: [] as string[] }, 2) },
    ]);
    renderNotes();
    await user.type(await screen.findByLabelText('Поиск'), 'паспорт');
    expect(screen.getByText('Билеты')).toBeInTheDocument();
    expect(screen.queryByText('Идеи')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Поиск'));
    await user.type(screen.getByLabelText('Поиск'), 'zzz');
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });
});
