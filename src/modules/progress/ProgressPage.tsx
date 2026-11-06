import { useState } from 'react';
import { todayKey } from '../../core/dates';
import { Card, Empty, Page, Segmented } from '../../ui';
import { Overview } from './components/Overview';
import { QuestsTab } from './components/QuestsTab';
import { SkillsTab } from './components/SkillsTab';
import { useXpSources } from './data/sources';
import { useQuests } from './data/useQuests';
import { summarize } from './logic/xp';

type Tab = 'overview' | 'skills' | 'quests';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Обзор' },
  { value: 'skills', label: 'Навыки' },
  { value: 'quests', label: 'Квесты' },
];

/** `/progress` — level, skills and daily quests over all blocks, computed from their tables. */
export function ProgressPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const sources = useXpSources();
  const quests = useQuests();
  if (!sources)
    return (
      <Page title="Прогресс">
        <Card>
          <Empty>Загрузка…</Empty>
        </Card>
      </Page>
    );
  return (
    <Page title="Прогресс">
      <Segmented label="Раздел" value={tab} options={TABS} onChange={setTab} />
      {tab === 'overview' && <Overview s={summarize(sources, todayKey())} />}
      {tab === 'skills' && <SkillsTab sources={sources} />}
      {tab === 'quests' && <QuestsTab state={quests} />}
    </Page>
  );
}
