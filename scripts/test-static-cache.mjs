import { startServer } from '../server/index.js';

const PORT = 3098;
const REQUIRED_BEYS = ['lightning_ldrago', 'eagle', 'striker'];

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const srv = await startServer(PORT, { serveStatic: true });

try {
  const bare = await fetch(`http://127.0.0.1:${PORT}/js/game/beys.js`);
  const bareText = await bare.text();
  const cacheControl = bare.headers.get('cache-control') ?? '';

  assert(bare.ok, `GET /js/game/beys.js failed: ${bare.status}`);
  assert(/no-cache/i.test(cacheControl), `expected no-cache on beys.js, got ${cacheControl}`);
  for (const id of REQUIRED_BEYS) {
    assert(bareText.includes(`id: '${id}'`), `beys.js missing ${id}`);
  }

  const versioned = await fetch(`http://127.0.0.1:${PORT}/js/game/beys.js?v=18`);
  const versionedText = await versioned.text();
  assert(versioned.ok, `GET /js/game/beys.js?v=17 failed: ${versioned.status}`);
  assert(versionedText === bareText, 'versioned beys.js should match bare path body');

  const etag = bare.headers.get('etag');
  assert(etag, 'beys.js should return ETag');
  const notModified = await fetch(`http://127.0.0.1:${PORT}/js/game/beys.js`, {
    headers: { 'If-None-Match': etag },
  });
  assert(notModified.status === 304, `expected 304 for If-None-Match, got ${notModified.status}`);

  console.log('test-static-cache: ok');
} finally {
  await srv.close();
}
