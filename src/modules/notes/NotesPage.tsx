import { Card, Empty, Page } from '../../ui';

/** `/notes` — the block is not built yet: name, one line of what it will do, and «скоро». */
export function NotesPage() {
  return (
    <Page title="Заметки">
      <Card>
        <Empty>
          Блок «Заметки» — скоро.
          <br />
          <span className="text-zinc-400 dark:text-zinc-500">
            Страницы в markdown, привязанные к проектам, событиям и дням; поиск, обратные ссылки, шаблон подготовки к
            событию.
          </span>
        </Empty>
      </Card>
    </Page>
  );
}
