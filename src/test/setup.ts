import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetPlatform } from './platform';

// Unmount rendered components between tests (no vitest globals, so RTL can't register this itself).
afterEach(() => {
  cleanup();
  window.location.hash = '';
  resetPlatform();
});
