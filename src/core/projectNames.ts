/**
 * One rule for «the same project name», shared by the tasks module and the import path
 * (`core/logging/tasks.ts`): case-insensitive (Russian locale), surrounding spaces ignored.
 */
export function sameProjectName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru');
}
