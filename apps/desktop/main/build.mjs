// Bundles the main process and the preload script to CommonJS for Electron.
// Workspace packages (@excise/*) are TypeScript source, so they are bundled in;
// npm packages (Electron, native modules) stay external and load from node_modules.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const bundleWorkspaceOnly = {
  name: 'externals',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith('@excise/') ? undefined : { path: args.path, external: true },
    );
  },
};

/** `import sql from './x.sql?raw'` (packages/db migrations): the file's text. */
const rawText = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'warning',
  // D's package finds its own files with import.meta.dirname, which a CJS bundle does not have;
  // the main process passes those paths explicitly (src/main.ts, documentsRoot).
  define: { 'import.meta.dirname': 'undefined' },
  plugins: [rawText, bundleWorkspaceOnly],
};

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' });
await build({ ...common, entryPoints: ['../preload/src/preload.ts'], outfile: 'dist/preload.cjs' });
