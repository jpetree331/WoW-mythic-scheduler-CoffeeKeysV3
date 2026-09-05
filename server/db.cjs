const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const v = require("./validation.cjs");
const hashKey = (key) =>
  typeof key === "string" && /^[a-f0-9]{64}$/.test(key)
    ? createHash("sha256").update(key).digest("hex")
    : null;

function createDatabase(options = {}) {
  let initialized;
  let client;
  let queue = Promise.resolve();
  async function ready() {
    if (!initialized)
      initialized = (async () => {
        let url =
          options.url ?? process.env.DATABASE_URL ?? "file:server/data/v3.db";
        v.check(
          !process.env.VERCEL || /^postgres(?:ql)?:\/\//.test(url),
          "Vercel requires a Neon/PostgreSQL DATABASE_URL.",
          503,
        );
        if (options.client) client = options.client;
        else if (/^postgres(?:ql)?:\/\//.test(url))
          client = require("./postgres.cjs").createPostgresClient({ url });
        else {
          if (url === "file:server/data/v3.db")
            fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
          client = require("@libsql/client").createClient({
            url,
            authToken: options.authToken ?? process.env.DATABASE_AUTH_TOKEN,
          });
        }
        const postgres = client.dialect === "postgres";
        if (!postgres) await client.execute("PRAGMA foreign_keys = ON");
        const tx = await client.transaction("write");
        try {
          await tx.execute(
            "CREATE TABLE IF NOT EXISTS v3_schema (version INTEGER PRIMARY KEY)",
          );
          const current = await tx.execute("SELECT version FROM v3_schema");
          if (!current.rows.length) {
            const sql = fs.readFileSync(
              path.join(
                __dirname,
                postgres
                  ? "migrations/postgres/001_v3.sql"
                  : "migrations/007_v3_schema.sql",
              ),
              "utf8",
            );
            for (const statement of sql
              .split(";")
              .map((s) => s.trim())
              .filter(Boolean))
              await tx.execute(statement);
            await tx.execute("INSERT INTO v3_schema VALUES (1)");
          } else
            v.check(
              current.rows[0].version === 1,
              "Unsupported database version.",
              503,
            );
          await tx.commit();
        } catch (error) {
          await tx.rollback();
          throw error;
        } finally {
          tx.close();
        }
        return client;
      })().catch(async (error) => {
        await client?.close();
        initialized = undefined;
        throw error;
      });
    return initialized;
  }
  // Local libSQL must serialize transactions on its one client. PostgreSQL uses
  // pooled connections and a database-wide write lock; reads can run together.
  async function transaction(fn, mode = "write") {
    const c = await ready();
    const run = async () => {
      const tx = await c.transaction(mode);
      try {
        const value = await fn(tx);
        await tx.commit();
        return value;
      } catch (error) {
        await tx.rollback();
        throw error;
      } finally {
        tx.close();
      }
    };
    if (c.dialect === "postgres") return run();
    const result = queue.then(run);
    queue = result.catch(() => {});
    return result;
  }
  const rows = async (tx, sql, args = []) =>
    (await tx.execute({ sql, args })).rows;
  const one = async (tx, sql, args = []) => (await rows(tx, sql, args))[0];
  function decode(row, actor) {
    const data = v.player(JSON.parse(row.payload));
    const memberId = row.owner_hash
      ? createHash("sha256")
          .update(`public-member:${row.board}:${row.owner_hash}`)
          .digest("hex")
          .slice(0, 24)
      : row.id;
    return {
      ...data,
      id: row.id,
      memberId,
      version: row.version,
      isMine: !!actor.hash && row.owner_hash === actor.hash,
      canEdit: !!actor.admin || (!!actor.hash && row.owner_hash === actor.hash),
    };
  }
  async function getPlayer(tx, board, id, actor, edit = false) {
    const row = await one(
      tx,
      "SELECT * FROM v3_players WHERE board = ? AND id = ?",
      [board, id],
    );
    v.check(row, "Character not found.", 404);
    v.check(
      !edit || actor.admin || (actor.hash && actor.hash === row.owner_hash),
      "This character belongs to another member.",
      403,
    );
    return row;
  }
  async function getEvent(tx, board, id, revision) {
    const row = await one(
      tx,
      "SELECT * FROM v3_events WHERE board = ? AND id = ?",
      [board, id],
    );
    v.check(row, "Event not found.", 404);
    v.check(
      row.revision === v.revision(revision),
      "This event changed. Refresh and review before saving.",
      409,
    );
    return row;
  }
  async function groups(tx, eventId) {
    const result = new Map();
    for (const row of await rows(
      tx,
      "SELECT * FROM v3_assignments WHERE event_id = ? ORDER BY group_id, role, player_id",
      [eventId],
    )) {
      if (!result.has(row.group_id))
        result.set(row.group_id, {
          id: row.group_id,
          tier: row.tier,
          seats: [],
        });
      result
        .get(row.group_id)
        .seats.push({ playerId: row.player_id, role: row.role });
    }
    return [...result.values()];
  }
  async function remember(tx, eventId) {
    const current = await one(
      tx,
      "SELECT revision FROM v3_events WHERE id = ?",
      [eventId],
    );
    await tx.execute({
      sql: "INSERT INTO v3_history(event_id, revision, snapshot, created_at) VALUES(?,?,?,?)",
      args: [
        eventId,
        current.revision,
        JSON.stringify(await groups(tx, eventId)),
        Date.now(),
      ],
    });
  }
  async function bump(tx, eventId) {
    await tx.execute({
      sql: "UPDATE v3_events SET revision = revision + 1 WHERE id = ?",
      args: [eventId],
    });
  }
  async function validateGroups(tx, eventId, input) {
    v.check(Array.isArray(input) && input.length <= 100, "Invalid group list.");
    const attendees = new Map(
      (
        await rows(
          tx,
          "SELECT s.*, p.payload FROM v3_signups s JOIN v3_players p ON p.id=s.player_id WHERE s.event_id=?",
          [eventId],
        )
      ).map((r) => [r.player_id, r]),
    );
    const used = new Set(),
      ids = new Set();
    for (const g of input) {
      v.check(v.object(g), "Invalid group.");
      v.text(g.id, "Group ID", 80, true);
      v.tier(g.tier);
      v.check(!ids.has(g.id), "Group IDs must be distinct.");
      ids.add(g.id);
      v.check(
        Array.isArray(g.seats) &&
          g.seats.length === 5 &&
          g.seats.every(v.object),
        "Published groups need five distinct players.",
      );
      v.check(
        JSON.stringify(g.seats.map((s) => s.role).sort()) ===
          JSON.stringify(["DPS", "DPS", "DPS", "Healer", "Tank"]),
        "Each group needs one tank, one healer and three DPS.",
      );
      for (const seat of g.seats) {
        const p = attendees.get(seat.playerId);
        v.check(
          p &&
            !used.has(seat.playerId) &&
            p.tier === g.tier &&
            JSON.parse(p.payload).roles.includes(seat.role),
          "A player is duplicated, unavailable, in a different tier, or cannot play that role.",
        );
        used.add(seat.playerId);
      }
    }
  }
  return {
    ready,
    transaction,
    close: () => client?.close(),
    consumeRateLimit: async (ip, limit) => {
      const c = await ready();
      v.check(
        c.consumeRateLimit,
        "Shared rate limiting requires PostgreSQL.",
        503,
      );
      return c.consumeRateLimit(ip, limit);
    },
    health: () => transaction((tx) => tx.execute("SELECT 1"), "read"),
    snapshot: (board, actor) =>
      transaction(async (tx) => {
        const title =
          (await one(tx, "SELECT title FROM v3_boards WHERE board=?", [board]))
            ?.title || "Coffee & Keys";
        const players = [];
        for (const row of await rows(
          tx,
          "SELECT * FROM v3_players WHERE board=? ORDER BY created_at,id",
          [board],
        )) {
          // Imported/externally corrupted records cannot crash the whole board.
          try {
            players.push(decode(row, actor));
          } catch {
            /* operator can inspect quarantine/import report */
          }
        }
        const events = [];
        for (const row of await rows(
          tx,
          "SELECT * FROM v3_events WHERE board=?",
          [board],
        )) {
          const signups = (
            await rows(
              tx,
              "SELECT player_id,tier FROM v3_signups WHERE event_id=?",
              [row.id],
            )
          ).map((r) => ({ playerId: r.player_id, tier: r.tier }));
          events.push({
            ...JSON.parse(row.payload),
            id: row.id,
            revision: row.revision,
            status: row.status,
            published: !!row.published,
            signups,
            groups: await groups(tx, row.id),
          });
        }
        events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return { title, players, events, isAdmin: !!actor.admin };
      }, "read"),
    setTitle: (board, title) =>
      transaction((tx) =>
        tx.execute({
          sql: "INSERT INTO v3_boards VALUES(?,?) ON CONFLICT(board) DO UPDATE SET title=excluded.title",
          args: [board, v.text(title, "Board title", 100, true)],
        }),
      ),
    savePlayer: (board, id, input, actor) =>
      transaction(async (tx) => {
        let current;
        if (id) {
          current = await getPlayer(tx, board, id, actor, true);
          v.check(
            current.version === v.revision(input.version),
            "This character changed. Reopen the editor before saving.",
            409,
          );
        } else
          v.check(
            actor.hash,
            "A private edit key is required. Enable browser storage or restore your key.",
            401,
          );
        const data = v.player(
          current ? { ...JSON.parse(current.payload), ...input } : input,
        );
        if (!current) {
          v.check(
            typeof input.requestId === "string" &&
              /^[a-zA-Z0-9-]{16,80}$/.test(input.requestId),
            "A request ID is required. Reload the form and retry.",
          );
          const previous = await one(
            tx,
            "SELECT p.id,p.payload FROM v3_requests r JOIN v3_players p ON p.id=r.player_id WHERE r.board=? AND r.owner_hash=? AND r.request_id=?",
            [board, actor.hash, input.requestId],
          );
          if (previous) {
            v.check(
              previous.payload === JSON.stringify(data),
              "That save already succeeded. Refresh the roster before making further changes.",
              409,
            );
            return { id: previous.id };
          }
        }
        const playerId = id || randomUUID();
        if (current) {
          await tx.execute({
            sql: "UPDATE v3_players SET payload=?, version=version+1 WHERE id=?",
            args: [JSON.stringify(data), playerId],
          });
          const assigned = await rows(
            tx,
            "SELECT * FROM v3_assignments WHERE player_id=?",
            [id],
          );
          for (const a of assigned)
            if (!data.roles.includes(a.role)) {
              await remember(tx, a.event_id);
              await tx.execute({
                sql: "DELETE FROM v3_assignments WHERE event_id=? AND player_id=?",
                args: [a.event_id, id],
              });
            }
          // Capability/name edits invalidate any organizer draft, even if unassigned.
          for (const s of await rows(
            tx,
            "SELECT event_id FROM v3_signups WHERE player_id=?",
            [id],
          ))
            await bump(tx, s.event_id);
        } else {
          const total = await one(
            tx,
            "SELECT count(*) n FROM v3_players WHERE board=?",
            [board],
          );
          v.check(
            total.n < 500,
            "This board has reached its character limit.",
            409,
          );
          await tx.execute({
            sql: "INSERT INTO v3_players VALUES(?,?,?,?,0,?)",
            args: [
              playerId,
              board,
              actor.hash,
              JSON.stringify(data),
              Date.now(),
            ],
          });
          await tx.execute({
            sql: "INSERT INTO v3_requests VALUES(?,?,?,?)",
            args: [board, actor.hash, input.requestId, playerId],
          });
        }
        return { id: playerId };
      }),
    createClaim: (board, id) =>
      transaction(async (tx) => {
        await getPlayer(tx, board, id, { admin: true });
        const code = randomBytes(32).toString("hex");
        await tx.execute({
          sql: "INSERT INTO v3_claims VALUES(?,?,?) ON CONFLICT(player_id) DO UPDATE SET token_hash=excluded.token_hash, expires_at=excluded.expires_at",
          args: [id, hashKey(code), Date.now() + 86400_000],
        });
        return { code };
      }),
    claim: (board, code, actor) =>
      transaction(async (tx) => {
        v.check(
          actor.hash && hashKey(code),
          "A valid claim code and private edit key are required.",
          400,
        );
        const row = await one(
          tx,
          "SELECT c.* FROM v3_claims c JOIN v3_players p ON p.id=c.player_id WHERE c.token_hash=? AND p.board=?",
          [hashKey(code), board],
        );
        v.check(
          row && row.expires_at > Date.now(),
          "This claim code is invalid, expired, or already used.",
          400,
        );
        const conflicts = await rows(
          tx,
          "SELECT s.event_id FROM v3_signups s JOIN v3_signups mine ON mine.event_id=s.event_id AND mine.member_hash=? WHERE s.player_id=? AND mine.player_id!=?",
          [actor.hash, row.player_id, row.player_id],
        );
        v.check(
          !conflicts.length,
          "You already have another character in one of these events. Cancel that signup before claiming.",
          409,
        );
        await tx.execute({
          sql: "UPDATE v3_players SET owner_hash=?,version=version+1 WHERE id=?",
          args: [actor.hash, row.player_id],
        });
        await tx.execute({
          sql: "UPDATE v3_signups SET member_hash=? WHERE player_id=?",
          args: [actor.hash, row.player_id],
        });
        await tx.execute({
          sql: "DELETE FROM v3_claims WHERE player_id=?",
          args: [row.player_id],
        });
        return { id: row.player_id };
      }),
    deletePlayer: (board, id, revision, actor) =>
      transaction(async (tx) => {
        const p = await getPlayer(tx, board, id, actor, true);
        v.check(
          p.version === v.revision(revision),
          "This character changed. Refresh first.",
          409,
        );
        for (const s of await rows(
          tx,
          "SELECT event_id FROM v3_signups WHERE player_id=?",
          [id],
        )) {
          await remember(tx, s.event_id);
          await bump(tx, s.event_id);
        }
        await tx.execute({
          sql: "DELETE FROM v3_players WHERE id=?",
          args: [id],
        });
      }),
    createEvent: (board, input) =>
      transaction(async (tx) => {
        const data = v.event(input);
        const id = randomUUID();
        const total = await one(
          tx,
          "SELECT count(*) n FROM v3_events WHERE board=? AND status!='completed'",
          [board],
        );
        v.check(
          total.n < 52,
          "Archive an older event before adding more.",
          409,
        );
        await tx.execute({
          sql: "INSERT INTO v3_events(id,board,payload) VALUES(?,?,?)",
          args: [id, board, JSON.stringify(data)],
        });
        return { id };
      }),
    setStatus: (board, id, status, revision) =>
      transaction(async (tx) => {
        await getEvent(tx, board, id, revision);
        v.check(
          ["open", "locked", "completed"].includes(status),
          "Invalid event status.",
        );
        await tx.execute({
          sql: "UPDATE v3_events SET status=?,revision=revision+1 WHERE id=?",
          args: [status, id],
        });
      }),
    signup: (board, id, input, actor) =>
      transaction(async (tx) => {
        const event = await getEvent(tx, board, id, input.revision);
        v.check(
          event.status === "open",
          "Signups are closed for this event.",
          409,
        );
        v.check(
          Date.parse(JSON.parse(event.payload).startsAt) > Date.now(),
          "This event has already started.",
          409,
        );
        const p = await getPlayer(tx, board, input.playerId, actor, true);
        const member = p.owner_hash || `legacy:${p.id}`;
        await remember(tx, id);
        // Switching characters or canceling affects this occurrence only.
        await tx.execute({
          sql: "DELETE FROM v3_signups WHERE event_id=? AND member_hash=?",
          args: [id, member],
        });
        if (!input.cancel)
          await tx.execute({
            sql: "INSERT INTO v3_signups VALUES(?,?,?,?)",
            args: [id, p.id, member, v.tier(input.tier)],
          });
        await bump(tx, id);
      }),
    publish: (board, id, input) =>
      transaction(async (tx) => {
        const event = await getEvent(tx, board, id, input.revision);
        v.check(
          event.status !== "completed",
          "Reopen the event before changing groups.",
          409,
        );
        await validateGroups(tx, id, input.groups);
        await remember(tx, id);
        await tx.execute({
          sql: "DELETE FROM v3_assignments WHERE event_id=?",
          args: [id],
        });
        for (const g of input.groups)
          for (const s of g.seats)
            await tx.execute({
              sql: "INSERT INTO v3_assignments VALUES(?,?,?,?,?)",
              args: [id, s.playerId, g.id, g.tier, s.role],
            });
        await tx.execute({
          sql: "UPDATE v3_events SET published=1, revision=revision+1 WHERE id=?",
          args: [id],
        });
      }),
  };
}
module.exports = { createDatabase, hashKey };
