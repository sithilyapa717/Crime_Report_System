// `import sql from './x.sql?raw'`: the file's text (Vite in tests, an esbuild plugin in the app).
declare module '*.sql?raw' {
  const text: string;
  export default text;
}
