import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shells (Android now, iOS after the Apple account) wrap the same Vite bundle — ADR-0008.
 * `npm run build && npx cap sync android` copies `dist/` into `android/`.
 */
const config: CapacitorConfig = {
  // Store identity: changing it after the first store release creates a different app.
  appId: 'com.manificento.lifeos',
  appName: 'LifeOS',
  webDir: 'dist',
};

export default config;
