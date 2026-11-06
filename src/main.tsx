import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startServiceWorker } from './app/serviceWorker';
import { isNativePlatform } from './core/platform';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void startServiceWorker({
  native: isNativePlatform(),
  container: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  caches: 'caches' in window ? window.caches : undefined,
});
