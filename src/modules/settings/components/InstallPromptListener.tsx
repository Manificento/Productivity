import { useEffect } from 'react';
import { listenForInstallPrompt } from './installPrompt';

/** `AppModule.Background` of settings: catches the browser's install offer on any page. Renders nothing. */
export function InstallPromptListener() {
  useEffect(() => listenForInstallPrompt(), []);
  return null;
}
