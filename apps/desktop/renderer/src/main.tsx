// Renderer entry. Fonts are bundled (no internet needed, the CSP allows only the app's own files).
import '@fontsource/noto-sans-sinhala/400.css';
import '@fontsource/noto-sans-sinhala/600.css';
import '@fontsource/noto-sans-sinhala/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTextSize, storedTextSize } from '../design-system/text-size.js';
import { App } from './App.js';

applyTextSize(storedTextSize());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
