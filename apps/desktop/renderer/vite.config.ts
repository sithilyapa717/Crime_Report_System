// Renderer build: React + TypeScript. Output goes to dist/index.html, which the main process
// loads with `file://` (hence the relative base). The dev server (port 5173) is used with
// EXCISE_RENDERER_URL=http://localhost:5173.
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Strict Content-Security-Policy for the built app: only the app's own files, no remote fonts or
 * scripts, no inline code. Data URLs for picture previews only. Not added in dev mode, where Vite
 * injects inline scripts for hot reload.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'excise-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    ),
});

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), csp()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, assetsInlineLimit: 0 },
  server: { port: 5173, strictPort: true },
});
