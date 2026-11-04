import type { ComponentType } from 'react';

/**
 * Every feature module exports one manifest from src/modules/<id>/index.ts.
 * The app shell builds routes and navigation from these — modules never edit the shell.
 */
export interface AppModule {
  id: string;
  /** Russian label shown in navigation. */
  title: string;
  /** Route path, e.g. '/tasks'. Sub-routes: use a '/*' suffix and nested <Routes> inside the page. */
  path: string;
  /** Emoji icon for the bottom navigation. */
  icon: string;
  /** Position in the bottom navigation; omit to hide from it. */
  navOrder?: number;
  Page: ComponentType;
}
