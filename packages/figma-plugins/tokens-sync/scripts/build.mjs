#!/usr/bin/env node
// Builds the plugin. Figma inlines the UI as a single HTML string (`__html__`), so the
// bundled UI script is injected into ui.html rather than referenced.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const watch = process.argv.includes('--watch');

mkdirSync(DIST, { recursive: true });

const shared = { bundle: true, format: 'iife', target: 'es2017', logLevel: 'info' };

async function buildOnce() {
  await build({
    ...shared,
    entryPoints: [join(ROOT, 'src', 'main.ts')],
    outfile: join(DIST, 'main.js'),
  });

  const ui = await build({
    ...shared,
    entryPoints: [join(ROOT, 'src', 'ui.ts')],
    write: false,
  });

  const html = readFileSync(join(ROOT, 'src', 'ui.html'), 'utf8');
  writeFileSync(join(DIST, 'ui.html'), html.replace('__UI_SCRIPT__', ui.outputFiles[0].text));
  console.error('✓ dist/main.js and dist/ui.html');
}

await buildOnce();

if (watch) {
  const { watch: watchFiles } = await import('node:fs');
  watchFiles(join(ROOT, 'src'), { recursive: true }, () => {
    buildOnce().catch((error) => console.error(error.message));
  });
  console.error('watching src/…');
}
