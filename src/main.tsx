import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
async function start() {
  const query = new URLSearchParams(window.location.search);
  const Component =
    query.get('studio') === 'buddy'
      ? (await import('./BuddyStudio')).default
      : query.get('studio') === 'panel'
        ? (await import('./BuddyPanelPreview')).default
        : import.meta.env.MODE === 'public' || query.get('demo') === 'public'
          ? (await import('./PublicDemo')).default
          : query.get('workspace') === 'data'
            ? (await import('./App')).default
            : (await import('./ComputerCompanion')).default;
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>,
  );
}
void start();
