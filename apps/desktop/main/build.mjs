// Bundles the main process and the preload script to CommonJS for Electron.
// Workspace packages (@excise/*) are TypeScript source, so they are bundled in;
// npm packages (Electron, native modules) stay external and load from node_modules.
import { build } from 'esbuild';

const bundleWorkspaceOnly = {
  name: 'externals',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith('@excise/') ? undefined : { path: args.path, external: true },
    );
  },
};

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'warning',
  plugins: [bundleWorkspaceOnly],
};

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' });
await build({ ...common, entryPoints: ['../preload/src/preload.ts'], outfile: 'dist/preload.cjs' });
