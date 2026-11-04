import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../SettingsPage';
import { InstallPromptListener } from './InstallPromptListener';

/** What Chrome dispatches when the site can be installed. */
function installPromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <InstallPromptListener />
      <SettingsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  act(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });
});

describe('Установка приложения', () => {
  it('Given Chrome на Android When сайт открыт Then в настройках есть кнопка «Установить», если браузер её поддерживает', async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.queryByRole('button', { name: 'Установить' })).not.toBeInTheDocument();

    const event = installPromptEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true); // our button replaces Chrome's mini-infobar
    await user.click(await screen.findByRole('button', { name: 'Установить' }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // A prompt can be used once: after the choice the button goes away.
    expect(await screen.findByText('Приложение установлено')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Установить' })).not.toBeInTheDocument();
  });

  it('a dismissed prompt hides the button until the browser offers it again', async () => {
    const user = userEvent.setup();
    renderSettings();
    act(() => {
      window.dispatchEvent(installPromptEvent('dismissed'));
    });
    await user.click(await screen.findByRole('button', { name: 'Установить' }));
    expect(screen.queryByRole('button', { name: 'Установить' })).not.toBeInTheDocument();
    expect(screen.queryByText('Приложение установлено')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(installPromptEvent('accepted'));
    });
    expect(await screen.findByRole('button', { name: 'Установить' })).toBeInTheDocument();
  });

  it('shows an error when the browser refuses to open its dialog', async () => {
    const user = userEvent.setup();
    renderSettings();
    const event = installPromptEvent('accepted');
    event.prompt = vi.fn(() => Promise.reject(new Error('not allowed')));
    act(() => {
      window.dispatchEvent(event);
    });
    await user.click(await screen.findByRole('button', { name: 'Установить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Браузер не дал установить приложение');
  });

  it('is captured on any page: the prompt that fired before opening «Настройки» is still offered', async () => {
    const { unmount } = render(<InstallPromptListener />);
    act(() => {
      window.dispatchEvent(installPromptEvent('accepted'));
    });
    unmount();
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Установить' })).toBeInTheDocument();
  });
});
