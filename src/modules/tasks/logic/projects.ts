import type { Id, Project } from '../../../core/types';

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru');

/** Error text for a project name, or undefined when it is fine. `selfId` — the project being renamed. */
export function validateProjectName(name: string, projects: Project[], selfId?: Id): string | undefined {
  if (name.trim() === '') return 'Введите название проекта';
  const clash = projects.some((p) => !p.archived && p.id !== selfId && sameName(p.name, name));
  return clash ? 'Такой проект уже есть' : undefined;
}

/** Non-archived projects, alphabetically. */
export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** The active project with this name, ignoring case and surrounding spaces. */
export function findActiveProject(projects: Project[], name: string): Project | undefined {
  return projects.find((p) => !p.archived && sameName(p.name, name));
}
