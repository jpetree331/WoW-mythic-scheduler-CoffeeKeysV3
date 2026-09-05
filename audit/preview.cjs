// Disposable production-build preview. Synthetic data only; no live DB.
// ?board=error intentionally returns HTTP 503 for new character saves.
const { createApp } = require('../server/server.cjs');
const { createDatabase } = require('../server/db.cjs');
const { seed, eventInput } = require('../tests/helpers.cjs');
(async () => {
  const db = createDatabase({ url: ':memory:' }); await db.ready();
  await seed(db); await db.createEvent('audit', { ...eventInput(), title: 'Sunday Coffee & Keys', startsAt: new Date(Date.now() + 8 * 86400_000).toISOString() });
  const app = createApp({ db, adminToken: 'audit-only-organizer-secret-123456' });
  const handler = app.server.listeners('request')[0]; app.server.removeListener('request', handler);
  app.server.on('request', (req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/api/players?board=error')) {
      res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Intentional audit outage. Retry later; your draft is preserved.' }));
    } else handler(req, res);
  });
  app.server.listen(4300, '127.0.0.1', () => console.log('V3 audit preview: http://127.0.0.1:4300/?board=audit'));
  process.on('SIGINT', () => app.close().then(() => process.exit(0)));
})();
