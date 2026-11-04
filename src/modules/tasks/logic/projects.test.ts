import { describe, expect, it } from 'vitest';
import type { Project } from '../../../core/types';
import { activeProjects, findActiveProject, validateProjectName } from './projects';

function project(id: string, name: string, archived = false): Project {
  return { id, name, archived, createdAt: 0, updatedAt: 0 };
}

describe('projects logic', () => {
  it('rejects an empty project name', () => {
    expect(validateProjectName('  ', [])).toBe('Введите название проекта');
  });

  it('rejects a duplicate name of an active project, ignoring case', () => {
    expect(validateProjectName('учёба', [project('p', 'Учёба')])).toBe('Такой проект уже есть');
  });

  it('allows the same name when renaming the project itself or when the other one is archived', () => {
    expect(validateProjectName('Учёба ', [project('p', 'Учёба')], 'p')).toBeUndefined();
    expect(validateProjectName('Учёба', [project('p', 'Учёба', true)])).toBeUndefined();
  });

  it('lists active projects by name', () => {
    const list = [project('b', 'Работа'), project('x', 'Старое', true), project('a', 'Английский')];
    expect(activeProjects(list).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('finds an active project by name ignoring case, skipping archived ones', () => {
    const list = [project('old', 'Учёба', true), project('p', 'Учёба')];
    expect(findActiveProject(list, ' учёба ')?.id).toBe('p');
    expect(findActiveProject([project('old', 'Учёба', true)], 'учёба')).toBeUndefined();
  });
});
