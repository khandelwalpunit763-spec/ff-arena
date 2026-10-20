// Build: src/ (ES modules) → www/ (classic IIFE bundles = works on file:// for HopWeb & Cordova)
//   node scripts/build.mjs           production build (minified)
//   node scripts/build.mjs --watch   rebuild on change (development)
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'www');
const isWatch = process.argv.includes('--watch');

function copyPublic() {
  cpSync(resolve(root, 'public'), out, { recursive: true });
}

const options = {
  absWorkingDir: root,
  entryPoints: {
    'js/player': 'src/player/main.js',
    'js/admin': 'src/admin/main.js',
    'css/player': 'src/styles/player.css',
    'css/admin': 'src/styles/admin.css',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome80', 'safari15', 'firefox78'],   // Android WebView 80+ / iOS 15+
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
  legalComments: 'none',
  loader: { '.woff2': 'file', '.woff': 'file' },
  external: ['../assets/*'],                      // map banners etc. are copied from public/
  assetNames: 'assets/fonts/[name]-[hash]',
  logLevel: 'info',
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyPublic();

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  watch(resolve(root, 'public'), { recursive: true }, () => copyPublic());
  console.log('👀 Watching src/ and public/ …');
} else {
  await esbuild.build(options);
  console.log('✅ Build complete → www/  (deploy to Firebase Hosting or zip for HopWeb / Cordova)');
}
