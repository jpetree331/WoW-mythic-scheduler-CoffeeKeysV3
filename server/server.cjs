const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { timingSafeEqual } = require("node:crypto");
const { createDatabase, hashKey } = require("./db.cjs");
const v = require("./validation.cjs");

function createApp(options = {}) {
  const db = options.db || createDatabase();
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? "";
  const boardTokens =
    options.boardTokens ?? JSON.parse(process.env.ADMIN_TOKENS || "{}");
  v.check(
    v.object(boardTokens),
    "ADMIN_TOKENS must be an object of board tokens.",
  );
  for (const token of [adminToken, ...Object.values(boardTokens)].filter(
    Boolean,
  ))
    v.check(
      typeof token === "string" && token.trim().length >= 24,
      "Organizer tokens must contain at least 24 characters.",
    );
  const origins = new Set(
    options.origins ??
      (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
  );
  const clients = new Set(),
    rates = new Map();
  const dist = path.resolve(__dirname, "../dist");
  const tokenFor = (board) =>
    Object.hasOwn(boardTokens, board) ? boardTokens[board] : adminToken;
  function authorized(req, board) {
    const expected = tokenFor(board);
    const supplied = req.headers.authorization?.replace(/^Bearer /, "") || "";
    return (
      !!expected &&
      Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    );
  }
  function send(res, status, value) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  }
  async function body(req) {
    let data = "";
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      v.check(bytes <= 128_000, "Request is too large.", 413);
      data += chunk;
    }
    let result;
    try {
      result = JSON.parse(data);
    } catch {
      throw new v.HttpError(400, "Send valid JSON.");
    }
    v.check(v.object(result), "Request must be an object.");
    return result;
  }
  function broadcast(board) {
    for (const c of clients)
      if (c.board === board) {
        if (!c.res.write("event: changed\ndata: {}\n\n")) {
          c.res.end();
          clients.delete(c);
        }
      }
  }
  async function route(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    const origin = req.headers.origin;
    if (origin) {
      let same = false;
      try {
        same = new URL(origin).host === req.headers.host;
      } catch {}
      v.check(same || origins.has(origin), "This origin is not allowed.", 403);
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type,Authorization,X-Owner-Key",
      });
      return res.end();
    }
    const url = new URL(req.url, "http://localhost");
    const board = v.boardSlug(url.searchParams.get("board") || "default");
    const actor = {
      hash: hashKey(req.headers["x-owner-key"]),
      admin: authorized(req, board),
    };
    const parts = url.pathname.split("/").filter(Boolean);
    const admin = () =>
      v.check(actor.admin, "Organizer sign-in required.", 401);
    if (req.method !== "GET" && req.method !== "HEAD") {
      const ip = req.socket.remoteAddress || "unknown";
      const now = Date.now();
      let rate = rates.get(ip);
      if (!rate || now - rate.start > 60_000) rate = { start: now, count: 0 };
      v.check(
        ++rate.count <= (options.rateLimit ?? 90),
        "Too many changes. Please wait one minute.",
        429,
      );
      rates.set(ip, rate);
    }
    if (url.pathname === "/api/health" && req.method === "GET") {
      await db.health();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/admin" && req.method === "GET") {
      admin();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/snapshot" && req.method === "GET")
      return send(res, 200, {
        ...(await db.snapshot(board, actor)),
        adminConfigured: !!tokenFor(board),
      });
    if (url.pathname === "/api/stream" && req.method === "GET") {
      const ip = req.socket.remoteAddress;
      v.check(
        clients.size < 1000 &&
          [...clients].filter((c) => c.ip === ip).length < 10,
        "Too many live connections.",
        429,
      );
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      const c = { board, res, ip };
      clients.add(c);
      res.on("close", () => clients.delete(c));
      return;
    }
    let result = { ok: true };
    if (url.pathname === "/api/board" && req.method === "PATCH") {
      admin();
      const b = await body(req);
      await db.setTitle(board, b.title);
    } else if (url.pathname === "/api/claim" && req.method === "POST") {
      const b = await body(req);
      result = await db.claim(board, b.code, actor);
    } else if (
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "players" &&
      parts[3] === "claim" &&
      req.method === "POST"
    ) {
      admin();
      result = await db.createClaim(board, parts[2]);
    } else if (url.pathname === "/api/players" && req.method === "POST")
      result = await db.savePlayer(board, null, await body(req), actor);
    else if (
      parts.length === 3 &&
      parts[0] === "api" &&
      parts[1] === "players" &&
      req.method === "PATCH"
    )
      result = await db.savePlayer(board, parts[2], await body(req), actor);
    else if (
      parts.length === 3 &&
      parts[0] === "api" &&
      parts[1] === "players" &&
      req.method === "DELETE"
    ) {
      const b = await body(req);
      await db.deletePlayer(board, parts[2], b.version, actor);
    } else if (url.pathname === "/api/events" && req.method === "POST") {
      admin();
      result = await db.createEvent(board, await body(req));
    } else if (
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "events" &&
      req.method === "PUT"
    ) {
      const b = await body(req);
      if (parts[3] === "signup") await db.signup(board, parts[2], b, actor);
      else if (parts[3] === "groups") {
        admin();
        await db.publish(board, parts[2], b);
      } else if (parts[3] === "status") {
        admin();
        await db.setStatus(board, parts[2], b.status, b.revision);
      } else throw new v.HttpError(404, "Not found.");
    } else {
      if (!url.pathname.startsWith("/api/") && req.method === "GET") {
        let requested;
        try {
          requested = path.resolve(
            dist,
            "." + decodeURIComponent(url.pathname),
          );
        } catch {
          throw new v.HttpError(400, "Invalid URL.");
        }
        v.check(
          requested === dist || requested.startsWith(dist + path.sep),
          "Not found.",
          404,
        );
        let file =
          fs.existsSync(requested) && fs.statSync(requested).isFile()
            ? requested
            : path.join(dist, "index.html");
        v.check(
          fs.existsSync(file),
          "Build the frontend with npm run build, or use npm run dev.",
          404,
        );
        const type =
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
          }[path.extname(file)] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": file.endsWith("index.html")
            ? "no-cache"
            : "public,max-age=31536000,immutable",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        });
        fs.createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
        return;
      }
      throw new v.HttpError(404, "Not found.");
    }
    broadcast(board);
    send(res, 200, result);
  }
  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => {
      if (res.headersSent) return res.end();
      if (!error.status)
        console.error("Request failed:", error.code || error.name);
      send(res, error.status || 503, {
        error: error.status
          ? error.message
          : "The service is temporarily unavailable. Your draft is safe; please retry.",
      });
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  const timer = setInterval(() => {
    for (const c of clients)
      if (!c.res.write(": heartbeat\n\n")) {
        c.res.end();
        clients.delete(c);
      }
    for (const [ip, rate] of rates)
      if (Date.now() - rate.start > 60_000) rates.delete(ip);
  }, 20_000);
  timer.unref();
  server.on("close", () => clearInterval(timer));
  return {
    server,
    db,
    close: async () => {
      clearInterval(timer);
      for (const c of clients) c.res.end();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}
if (require.main === module) {
  const app = createApp();
  app.db
    .ready()
    .then(() =>
      app.server.listen(
        Number(process.env.PORT || 8787),
        process.env.HOST || "127.0.0.1",
        () =>
          console.log(
            "Coffee & Keys listening on port " + (process.env.PORT || 8787),
          ),
      ),
    )
    .catch((error) => {
      console.error(
        "Database initialization failed:",
        error.code || error.message,
      );
      process.exitCode = 1;
      app.db.close();
    });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => app.close().then(() => process.exit(0)));
}
module.exports = { createApp };
