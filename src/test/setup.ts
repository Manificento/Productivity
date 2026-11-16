import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { trackDbTransactions, writesLeftByTest } from './dbWrites';
import { resetPlatform } from './platform';

trackDbTransactions();

// Unmount rendered components between tests (no vitest globals, so RTL can't register this itself).
afterEach(async () => {
  cleanup();
  window.location.hash = '';
  resetPlatform();
  // A test does not end with a write to the database still running (docs/process.md, #292).
  const left = await writesLeftByTest();
  if (left.length > 0) {
    throw new Error(
      `Тест закончился, а запись в базу ещё шла (${left.join(', ')}): ` +
        'дождитесь её результата на экране или в базе.',
    );
  }
});
