/**
 * Minimal dependency-free static file server for the web image.
 *
 * Written rather than installed so the runtime image contains no package that is not in
 * the committed lockfile (FR-049). An ad-hoc `npm i -g http-server` in a Dockerfile would
 * pin nothing and be invisible to the pipeline.
 *
 * Two behaviours the SPA needs and a plain file server does not give:
 *   1. SPA fallback - an unknown path serves index.html, so a deep link such as
 *      /sales-orders/42 is not a 404 from the server on a hard refresh.
 *   2. Path traversal is refused. A join that is not verified to stay inside the document
 *      root lets `GET /../../etc/passwd` escape the image, which is a real
 *      information-disclosure bug in every static server that skips the check.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = resolve(process.env.SERVE_DIR ?? '/app/dist');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** Resolves a URL path to a file inside ROOT, or null when it escapes. */
function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const candidate = resolve(join(ROOT, normalize(decoded)));

  // Refuse anything that resolves outside the document root.
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  return candidate;
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  let filePath = resolveSafe(request.url ?? '/');
  if (!filePath) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  // SPA fallback: anything that is not a real file serves the app shell.
  if (!existsSync(filePath)) {
    filePath = join(ROOT, 'index.html');
  }

  if (!existsSync(filePath)) {
    response.writeHead(404).end('Not Found');
    return;
  }

  const type = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
  response.writeHead(200, {
    'content-type': type,
    // Hashed asset filenames are immutable; index.html must never be cached or a deploy
    // leaves clients pointing at assets that no longer exist.
    'cache-control': filePath.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server listening on ${PORT}, serving ${ROOT}`);
});
