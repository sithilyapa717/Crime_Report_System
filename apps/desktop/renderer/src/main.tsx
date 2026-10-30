// Renderer entry. The screen font is bundled by design-system/styles.css (no internet needed).
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
