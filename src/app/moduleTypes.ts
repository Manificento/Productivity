import type { ComponentType } from 'react';

/** Where a block sits on the «Все блоки» screen. */
export type ModuleGroup = 'plan' | 'body' | 'mind' | 'knowledge' | 'system';

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
  /** Group on the «Все блоки» screen. */
  group: ModuleGroup;
  /** One line in Russian: what the block is for (shown on «Все блоки»). */
  summary: string;
  /** A skeleton without content yet: marked «скоро» on «Все блоки». */
  comingSoon?: boolean;
  /**
   * A pinned tab in the bottom bar, in this order (today is always the first tab, up to three more are pinned);
   * omit to reach the block through «Блоки».
   */
  navOrder?: number;
  Page: ComponentType;
  /**
   * Optional component the shell mounts once on every page, outside the routes — for work that must go on
   * while another module is open (e.g. the Pomodoro timer). Render nothing visible, or something fixed and small.
   */
  Background?: ComponentType;
}
