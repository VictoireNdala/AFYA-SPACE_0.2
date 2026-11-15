import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/bodoni-moda/wght-italic.css';
import '@fontsource-variable/instrument-sans';
import './styles.css';
import App from './App.jsx';
import { LiveProvider } from './lib/live.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LiveProvider>
      <App />
    </LiveProvider>
  </React.StrictMode>,
);
