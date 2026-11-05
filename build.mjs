
// Сборка интерфейса: esbuild (JSX → один бандл) + копирование шаблонов.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.cpSync(path.join(root, 'web/public'), out, { recursive: true });
fs.copyFileSync(path.join(root, 'web/index.html'), path.join(out, 'index.html'));

const opts = {
  entryPoints: { app: path.join(root, 'web/src/main.jsx') },
  outdir: path.join(out, 'assets'),
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  format: 'iife',
  target: ['es2020', 'safari15'],
  external: ['../img/*'],
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"'
  },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log('Слежу за изменениями…');
} else {
  await esbuild.build(opts);
}
