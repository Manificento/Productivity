import { useSyncExternalStore } from 'react';

/** Chrome's install offer (not in the DOM typings yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** The browser offered installation and the offer is unused. */
  canInstall: boolean;
  /** Installed in this visit (accepted or `appinstalled`). */
  installed: boolean;
}

/*
 * The offer comes once, on whatever page is open, so `InstallPromptListener` (mounted by the shell on
 * every page) keeps it here until «Настройки» shows the «Установить» button.
 */
let offer: BeforeInstallPromptEvent | undefined;
let state: InstallState = { canInstall: false, installed: false };
const listeners = new Set<() => void>();

function set(next: InstallState) {
  state = next;
  for (const l of listeners) l();
}

/** Starts listening for the browser's install offer; returns the cleanup. */
export function listenForInstallPrompt(): () => void {
  // No preventDefault(): Chrome's own install hint stays; the saved offer can still be used by the button.
  const onOffer = (e: Event) => {
    offer = e as BeforeInstallPromptEvent;
    set({ canInstall: true, installed: false });
  };
  const onInstalled = () => {
    offer = undefined;
    set({ canInstall: false, installed: true });
  };
  window.addEventListener('beforeinstallprompt', onOffer);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onOffer);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Shows the browser's install dialog; an offer can be used only once. */
async function install(): Promise<void> {
  const current = offer;
  if (!current) return;
  offer = undefined;
  try {
    await current.prompt();
  } catch (e) {
    set({ canInstall: false, installed: false }); // a used offer cannot be prompted again
    throw e;
  }
  const { outcome } = await current.userChoice;
  set({ canInstall: false, installed: outcome === 'accepted' });
}

/** Tests only: forget any offer, as on a fresh page. */
export function resetInstallPrompt(): void {
  offer = undefined;
  set({ canInstall: false, installed: false });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallPrompt(): InstallState & { install: () => Promise<void> } {
  return { ...useSyncExternalStore(subscribe, () => state), install };
}
