// Static server for www/ + same-origin proxy to the Firebase Emulator Suite.
//   node scripts/serve.mjs            → serves www/ with your real firebase-config.js
//   node scripts/serve.mjs --demo     → serves config/firebase-config.demo.js and proxies
//                                        Auth (9099) + Firestore (8080) emulators on the SAME
//                                        origin, so the app works behind any HTTPS preview URL.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const www = resolve(root, 'www');
const demo = process.argv.includes('--demo');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const AUTH = { host: '127.0.0.1', port: 9099 };
const FIRESTORE = { host: '127.0.0.1', port: 8080 };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.map': 'application/json',
};

function emulatorTarget(url) {
  if (!demo) return null;
  if (url.startsWith('/identitytoolkit.googleapis.com/') || url.startsWith('/securetoken.googleapis.com/')) return AUTH;
  if (url.startsWith('/google.firestore.v1.Firestore/') || url.startsWith('/v1/projects/')) return FIRESTORE;
  if (url.startsWith('/emulator/')) return /\/databases\//.test(url) ? FIRESTORE : AUTH;
  return null;
}

const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

function proxy(req, res, target) {
  const upstream = http.request({
    host: target.host, port: target.port, method: req.method, path: req.url, agent,
    headers: { ...req.headers, host: `${target.host}:${target.port}` },
  }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);                       // streaming (Firestore long-polling) friendly
  });
  // Browser aborted (e.g. long-poll rotated) → drop the upstream request quietly.
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  upstream.on('error', (e) => {
    if (res.headersSent || res.destroyed) { res.destroy(); return; }
    // The emulator closes superseded WebChannel long-poll requests without answering.
    // Finish them like a normal empty long-poll so the SDK simply polls again (no error).
    if (req.method === 'GET' && req.url.includes('/channel?')) { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(); return; }
    if (process.env.DEBUG_PROXY) console.warn(`proxy error ${req.method} ${req.url.slice(0, 80)}: ${e.message}`);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 502, message: `Emulator not reachable: ${e.message}` } }));
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';

  if (demo && pathname === '/firebase-config.js') {
    res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
    createReadStream(resolve(root, 'config/firebase-config.demo.js')).pipe(res);
    return;
  }
  const file = normalize(join(www, pathname));
  if (!file.startsWith(www) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const target = emulatorTarget(req.url);
  if (target) proxy(req, res, target);
  else serveStatic(req, res);
}).listen(PORT, HOST, () => {
  console.log(`🔥 FF Arena running → http://localhost:${PORT}  (player)  |  http://localhost:${PORT}/admin.html  (staff)`);
  if (demo) console.log('   DEMO mode: proxying Firebase Auth (9099) + Firestore (8080) emulators');
});
