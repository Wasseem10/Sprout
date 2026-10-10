import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ComputerCompanion from './ComputerCompanion';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get('workspace') === 'data' ? (
      <App />
    ) : (
      <ComputerCompanion />
    )}
  </React.StrictMode>,
);
