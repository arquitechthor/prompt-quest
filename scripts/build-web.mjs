// Empaqueta el frontend estático en dist/web (S3 + CloudFront en AWS, servidor local en desarrollo).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist/web', { recursive: true });
await build({
  entryPoints: ['src/web/main.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2020'],
  outfile: 'dist/web/app.js',
  logLevel: 'info',
});
copyFileSync('src/web/index.html', 'dist/web/index.html');
copyFileSync('src/web/styles.css', 'dist/web/styles.css');
