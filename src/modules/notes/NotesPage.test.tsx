import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0)); // 4 Nov 2026
  await Promise.all([db.notes.clear(), db.projects.clear(), db.lifeEvents.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
});

const exam = (): LifeEvent => ({
  ...newRecord({ title: 'IELTS', type: 'exam' as const, date: '2026-11-09', importance: 3 as const, prepDays: 5 }, 1),
});
const note = (title: string, linkIds: string[], at: number): Note => ({
  ...newRecord({ title, body: '', linkIds }, at),
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

    await user.click(await screen.findByRole('button', { name: /^Подготовка/ }));
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

  it('Given заметки одного события When я открываю любую из них Then раздел «Связано» со остальными заметками события', async () => {
    const user = userEvent.setup();
    const event = exam();
    await db.lifeEvents.add(event);
    await db.notes.bulkAdd([note('Слова', [event.id], 1), note('Эссе', [event.id], 2), note('Рецепты', [], 3)]);
    renderNotes();
    await user.click(await screen.findByRole('button', { name: /Слова/ }));
    const related = await screen.findByRole('region', { name: 'Связано' });
    expect(within(related).getByRole('button', { name: /Эссе/ })).toBeInTheDocument();
    expect(within(related).queryByText(/Рецепты/)).not.toBeInTheDocument();
    expect(within(related).queryByText(/Слова/)).not.toBeInTheDocument();
    await user.click(within(related).getByRole('button', { name: /Эссе/ }));
    expect(await screen.findByLabelText('Название')).toHaveValue('Эссе');
  });

  it('Given создано событие When я открываю «Заметки» Then предложение создать страницу по шаблону «подготовка к событию» с планом по дням из предпросмотра целей', async () => {
    const user = userEvent.setup();
    const event = exam();
    await db.lifeEvents.add(event);
    renderNotes();
    await user.click(await screen.findByRole('button', { name: 'Создать страницу «Подготовка: IELTS»' }));
    await screen.findByLabelText('Название');
    const [created] = await db.notes.toArray();
    expect(created).toMatchObject({ title: 'Подготовка: IELTS', linkIds: [event.id] });
    expect(created?.body).toContain('## План по дням');
    expect(created?.body.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- [ ]'))).toHaveLength(10);
    expect(created?.body).toMatch(/- 9 нояб\.? \(день события\)/);
    expect(created?.body).toMatch(/- 5 нояб\.? \(подготовка\)/);
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('button', { name: /Создать страницу/ })).not.toBeInTheDocument();
  });

  it('Given сегодняшний день When я нажимаю «Сегодня» в блоке Then открывается или создаётся дневная страница', async () => {
    const user = userEvent.setup();
    renderNotes();
    await user.click(await screen.findByRole('button', { name: 'Сегодня' }));
    expect(await screen.findByLabelText('Название')).toHaveValue('4 ноября 2026');
    expect(await db.notes.toArray()).toMatchObject([{ title: '4 ноября 2026', linkIds: ['2026-11-04'] }]);
    await user.type(screen.getByLabelText('Текст заметки'), 'дневник');
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await user.click(await screen.findByRole('button', { name: 'Сегодня' }));
    expect(await screen.findByLabelText('Текст заметки')).toHaveValue('дневник');
    expect(await db.notes.count()).toBe(1);
  });

  it('Given дневная страница переименована When я снова нажимаю «Сегодня» Then открывается та же страница, дубль не создаётся', async () => {
    const user = userEvent.setup();
    renderNotes();
    await user.click(await screen.findByRole('button', { name: 'Сегодня' }));
    await user.type(await screen.findByLabelText('Название'), ' — дневник');
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await user.click(await screen.findByRole('button', { name: 'Сегодня' }));
    expect(await screen.findByLabelText('Название')).toHaveValue('4 ноября 2026 — дневник');
    expect(await db.notes.count()).toBe(1);
  });

  it('Given заметка When я удаляю её с подтверждением Then она удалена, ссылки других заметок остаются', async () => {
    const user = userEvent.setup();
    const event = exam();
    await db.lifeEvents.add(event);
    const [a, b] = [note('Слова', [event.id, '2026-11-05'], 1), note('Эссе', [event.id], 2)];
    await db.notes.bulkAdd([a, b]);
    renderNotes();
    await user.click(await screen.findByRole('button', { name: /Слова/ }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить заметку?' })).getByRole('button', { name: 'Отмена' }),
    );
    expect(await db.notes.count()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить заметку?' })).getByRole('button', { name: 'Удалить' }),
    );
    await waitFor(async () => expect(await db.notes.get(a.id)).toBeUndefined());
    expect((await db.notes.get(b.id))?.linkIds).toEqual([event.id]);
    expect(await screen.findByRole('button', { name: /Эссе/ })).toBeInTheDocument();
  });

  it('Given проект в архиве When открываю выбор привязки Then он в конце списка с пометкой «в архиве», и карточка привязанной заметки её показывает', async () => {
    const user = userEvent.setup();
    const old: Project = { ...newRecord({ name: 'Старый', archived: true }, 1) };
    const fresh: Project = { ...newRecord({ name: 'Свежий', archived: false }, 2) };
    await db.projects.bulkAdd([old, fresh]);
    await db.notes.add(note('Итоги', [old.id, '2026-11-07'], 1));
    renderNotes();
    const card = await screen.findByRole('button', { name: /Итоги/ });
    await waitFor(() => expect(card).toHaveTextContent('Старый (в архиве)'));
    expect(card).toHaveTextContent('7 ноя 2026');
    expect(card).not.toHaveTextContent('2026-11-07');
    await user.click(card);
    const boxes = (await screen.findAllByLabelText(/^Проект:/)).map((b) => b.closest('label')?.textContent);
    expect(boxes).toEqual(['Проект: Свежий', 'Проект: Старый (в архиве)']);
    expect(screen.getByRole('button', { name: 'Убрать день 7 ноя 2026' })).toHaveTextContent('День 7 ноя 2026');
  });

  it('Given предпросмотр с чекбоксами When читает скринридер Then у чекбокса имя — текст пункта, и он недоступен для изменения', async () => {
    const user = userEvent.setup();
    await db.notes.add({
      ...newRecord({ title: 'Список', body: '- [x] паспорт\n- [ ] билет', linkIds: [] as string[] }, 1),
    });
    renderNotes();
    await user.click(await screen.findByRole('button', { name: /Список/ }));
    await user.click(screen.getByRole('button', { name: 'Предпросмотр' }));
    const done = screen.getByRole('checkbox', { name: 'паспорт' });
    expect(done).toBeChecked();
    expect(done).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'билет' })).toBeDisabled();
  });
});
