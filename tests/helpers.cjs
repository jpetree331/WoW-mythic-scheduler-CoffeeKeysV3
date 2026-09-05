const { randomUUID } = require("node:crypto");
const { createDatabase, hashKey } = require("../server/db.cjs");
const { createApp } = require("../server/server.cjs");
const { testDatabase } = require("./database.cjs");
const admin = { admin: true, hash: hashKey("a".repeat(64)) };
const member = (n) => ({
  admin: false,
  hash: hashKey(n.toString(16).padStart(64, "0")),
});
const input = (extra = {}) => ({
  name: "Audit character",
  roles: ["DPS"],
  timezone: "America/New_York",
  availability: { Monday: [{ start: 1140, end: 1260 }] },
  notes: "",
  discordName: "",
  wowClass: "",
  requestId: randomUUID(),
  ...extra,
});
const eventInput = () => ({
  title: "Coffee & Keys",
  startsAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
  duration: 120,
  timezone: "America/New_York",
});
async function withDb(fn, options) {
  const db = await testDatabase(options);
  try {
    await db.ready();
    return await fn(db);
  } finally {
    await db.close();
  }
}
async function seed(
  db,
  roles = [["Tank"], ["Healer"], ["DPS"], ["DPS"], ["DPS"]],
) {
  const event = await db.createEvent("audit", eventInput());
  const players = [];
  for (const [i, role] of roles.entries()) {
    const actor = member(i + 1);
    const p = await db.savePlayer(
      "audit",
      null,
      input({ name: `Person ${i}`, roles: role }),
      actor,
    );
    await db.signup(
      "audit",
      event.id,
      { playerId: p.id, tier: "2-5", revision: i },
      actor,
    );
    players.push({ id: p.id, roles: role, tier: "2-5", actor });
  }
  return { event, players, revision: roles.length };
}
async function withServer(fn, options = {}) {
  const app = createApp({
    db: options.db || (await testDatabase()),
    adminToken: "audit-only-organizer-secret-123456",
    rateLimit: 1000,
    ...options,
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  try {
    return await fn(app, url);
  } finally {
    await app.close();
  }
}
function loadTS(relative) {
  const fs = require("node:fs"),
    path = require("node:path"),
    ts = require("typescript");
  const root = path.resolve(__dirname, ".."),
    cache = new Map();
  function load(file) {
    if (file.endsWith(".js") || file.endsWith(".cjs")) return require(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const source = fs
      .readFileSync(file, "utf8")
      .replaceAll("import.meta.env", "({})");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("require", "module", "exports", output)(
      (id) => {
        if (!id.startsWith(".")) return require(id);
        const base = path.resolve(path.dirname(file), id);
        const target = ["", ".ts", ".tsx"]
          .map((ext) => base + ext)
          .find((p) => fs.existsSync(p));
        return load(target);
      },
      mod,
      mod.exports,
    );
    return mod.exports;
  }
  return load(path.resolve(root, relative));
}
module.exports = {
  withDb,
  withServer,
  seed,
  input,
  eventInput,
  admin,
  member,
  loadTS,
};
