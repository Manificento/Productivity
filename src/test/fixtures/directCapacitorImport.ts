// Fixture for src/core/boundaries.test.ts: a module file that reaches the native bridge directly.
// `npm run deps` excludes src/test/fixtures/, the test cruises this file on purpose.
import { Capacitor } from '@capacitor/core';

export const platformName = Capacitor.getPlatform();
