import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';

// Inter Variable (sans) + JetBrains Mono (mono) — TASK §5 (TYPOGRAPHY_RESEARCH).
// Fallback: system-ui / 'Segoe UI' / 'Roboto' / sans-serif.
// Imports antes del bundle CSS para que las @font-face se registren primero.
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';

import './index.css';
import './reference.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
