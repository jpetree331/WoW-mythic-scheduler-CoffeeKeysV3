// Run this in a fresh process with --no-experimental-require-module. It also
// executes against the exact packaged Vercel files during the packaging check.
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
(async () => {
  const root = process.argv[2] || path.resolve(__dirname, "..");
  const { createPostgresClient } = require(
    path.join(root, "server/postgres.cjs"),
  );
  const postgres = createPostgresClient({
    url: "postgresql://unused@127.0.0.1:1/unused",
  });
  await postgres.close(); // Load the driver and Vercel lifecycle helper without connecting.
  const { default: handler } = await import(
    pathToFileURL(path.join(root, "api/handler.js")).href
  );
  try {
    for (const route of ["stream", "admin", "health"]) {
      const request = {
        url: `/api/handler?route=${route}&board=audit`,
        method: "GET",
        headers: {},
        socket: {},
      };
      const response = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        writeHead(status, headers) {
          this.status = status;
          this.headersSent = true;
          Object.assign(this.headers, headers);
        },
        end(body) {
          this.body = body;
          this.ended = true;
        },
      };
      await handler(request, response);
      assert.equal(
        response.status,
        { stream: 204, admin: 401, health: 503 }[route],
      );
      assert.equal(response.ended, true);
      if (route === "health")
        assert.match(
          JSON.parse(response.body).error,
          /requires a Neon\/PostgreSQL DATABASE_URL/,
        );
    }
    console.log(
      "Vercel runtime startup passes without require(ESM); API responds and reports missing database configuration safely.",
    );
  } finally {
    await handler.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
