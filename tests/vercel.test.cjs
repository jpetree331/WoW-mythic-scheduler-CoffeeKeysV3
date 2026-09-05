const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createApp } = require("../server/server.cjs");
const { createDatabase } = require("../server/db.cjs");
const { input } = require("./helpers.cjs");
const { testDatabase } = require("./database.cjs");

async function invoke(
  handler,
  {
    url = "/api/players?board=audit",
    method = "POST",
    body,
    raw,
    headers = {},
  } = {},
) {
  const req = Readable.from(raw === undefined ? [] : [raw]);
  Object.assign(req, {
    url,
    method,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  });
  if (body !== undefined)
    Object.defineProperty(
      req,
      "body",
      typeof body === "function" ? { get: body } : { value: body },
    );
  const res = {
    headers: {},
    status: 200,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    writeHead(status, headers) {
      this.status = status;
      Object.assign(this.headers, headers);
      this.headersSent = true;
    },
    end(data) {
      this.data = data;
      this.ended = true;
    },
  };
  await handler(req, res);
  assert.ok(res.ended, "Serverless handler must finish and await its response");
  return res;
}

test("Vercel parsed and raw JSON bodies preserve private ownership and validation", async () => {
  const db = createDatabase({ url: ":memory:" });
  db.consumeRateLimit = async () => true;
  const app = createApp({ db, serverless: true, adminToken: "" });
  try {
    for (const body of [
      input(),
      JSON.stringify(input()),
      Buffer.from(JSON.stringify(input())),
    ]) {
      const result = await invoke(app.handler, {
        body,
        headers: { "x-owner-key": "a".repeat(64) },
      });
      assert.equal(result.status, 200);
    }
    assert.equal(
      (
        await invoke(app.handler, {
          raw: JSON.stringify(input()),
          headers: { "x-owner-key": "a".repeat(64) },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await invoke(app.handler, {
          body: () => {
            throw new SyntaxError();
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (await invoke(app.handler, { body: { notes: "x".repeat(128001) } }))
        .status,
      413,
    );
    assert.equal(
      (await invoke(app.handler, { url: "/api/stream", method: "GET" })).status,
      204,
    );
    assert.equal(
      (await invoke(app.handler, { url: "/", method: "GET" })).status,
      404,
    );
  } finally {
    await app.close();
  }
});

test("Vercel rate limiting uses only the platform IP header", async () => {
  let ip;
  const app = createApp({
    serverless: true,
    adminToken: "",
    db: {
      async consumeRateLimit(value) {
        ip = value;
        return false;
      },
      close() {},
    },
  });
  try {
    assert.equal(
      (
        await invoke(app.handler, {
          headers: {
            "x-vercel-forwarded-for": "192.0.2.1",
            "x-forwarded-for": "spoofed",
          },
        })
      ).status,
      429,
    );
    assert.equal(ip, "192.0.2.1");
  } finally {
    await app.close();
  }
});

test("Vercel deployment fails closed without PostgreSQL instead of writing local files", async () => {
  const original = process.env.VERCEL;
  process.env.VERCEL = "1";
  const db = createDatabase({ url: "file:server/data/should-not-exist.db" });
  try {
    await assert.rejects(db.ready(), /requires a Neon\/PostgreSQL/);
  } finally {
    await db.close();
    if (original === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original;
  }
});

test("actual Vercel export preserves rewritten path, board and query parameters", async () => {
  const module = await import("../api/handler.js");
  const result = await invoke(module.default, {
    url: "/api/handler?route=stream&board=audit",
    method: "GET",
  });
  assert.equal(result.status, 204);
  const missing = await invoke(module.default, {
    url: "/api/handler?route=unknown&board=audit",
    method: "GET",
  });
  assert.equal(missing.status, 404);
  const invalidBoard = await invoke(module.default, {
    url: "/api/handler?route=stream&board=invalid%20board",
    method: "GET",
  });
  assert.equal(invalidBoard.status, 400);
});

test(
  "Vercel entrypoint with a PostgreSQL URL completes authenticated event and signup requests",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const fixture = await testDatabase();
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set("options", `-c search_path=${fixture.testSchema}`);
    const db = createDatabase({ url: url.toString() });
    const { createHandler } = await import("../api/handler.js");
    const token = "isolated-vercel-organizer-token-12345";
    const handler = createHandler({ db, adminToken: token });
    const original = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const headers = {
        "x-owner-key": "b".repeat(64),
        "x-vercel-forwarded-for": "192.0.2.99",
        authorization: `Bearer ${token}`,
      };
      const call = (path, method, body, h = headers) =>
        invoke(handler, {
          url: `/api/handler?route=${path}&board=community`,
          method,
          body,
          headers: h,
        });
      const health = await call("health", "GET");
      assert.equal(health.status, 200);
      const character = await call(
        "players",
        "POST",
        input({ name: "Neon member", roles: ["Tank"] }),
      );
      assert.equal(character.status, 200);
      const playerId = JSON.parse(character.data).id;
      const event = await call(
        "events",
        "POST",
        require("./helpers.cjs").eventInput(),
      );
      assert.equal(event.status, 200);
      const eventId = JSON.parse(event.data).id;
      assert.equal(
        (
          await call(`events/${eventId}/signup`, "PUT", {
            playerId,
            tier: "2-5",
            revision: 0,
          })
        ).status,
        200,
      );
      const snapshot = await call("snapshot", "GET");
      assert.equal(snapshot.headers["Cache-Control"], "no-store");
      const state = JSON.parse(snapshot.data);
      assert.equal(state.players[0].name, "Neon member");
      assert.equal(state.players[0].isMine, true);
      assert.equal(state.events[0].signups[0].playerId, playerId);
      assert.equal(
        (
          await call(
            `events/${eventId}/status`,
            "PUT",
            { status: "locked", revision: 1 },
            {},
          )
        ).status,
        401,
      );
      assert.equal((await call("stream", "GET")).status, 204);
    } finally {
      await handler.close();
      await fixture.close();
      if (original === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = original;
    }
  },
);
