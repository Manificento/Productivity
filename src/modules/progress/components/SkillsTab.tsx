import { Card, Progress } from '../../../ui';
import { skillLevels, type XpSources } from '../logic/xp';

export function SkillsTab({ sources }: { sources: XpSources }) {
  const skills = skillLevels(sources);
  return (
    <Card title="Навыки">
      <ul className="flex flex-col gap-3" aria-label="Навыки">
        {skills.map((k) => (
          <li key={k.id} className="flex flex-col gap-1" data-testid={`skill-${k.id}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{k.label}</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                ур. <strong data-testid={`skill-${k.id}-level`}>{k.level}</strong> · {k.into}/{k.needed} XP
              </span>
            </div>
            <Progress label={`${k.label}: до следующего уровня`} value={k.into} max={k.needed} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
