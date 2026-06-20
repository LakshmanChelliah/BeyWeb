import { readFile, stat } from 'fs/promises';
import { join, extname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const ROUTES = {
  '/': 'index.html',
  '/pc': 'pc.html',
  '/pc/': 'pc.html',
};

function resolveStaticPath(pathname) {
  const routed = ROUTES[pathname];
  const rel = routed ?? (pathname.endsWith('/') ? `${pathname}index.html` : pathname);
  const filePath = resolve(ROOT, rel.replace(/^\//, ''));
  const rootWithSep = ROOT.endsWith(sep) ? ROOT : `${ROOT}${sep}`;
  if (!filePath.startsWith(rootWithSep) && filePath !== ROOT) {
    return null;
  }
  return filePath;
}

/** @returns {Promise<boolean>} true if a response was sent */
export async function tryServeStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://local');
  const filePath = resolveStaticPath(decodeURIComponent(url.pathname));
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return true;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}
