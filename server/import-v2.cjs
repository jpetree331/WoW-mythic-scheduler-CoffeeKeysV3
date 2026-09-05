// Explicit, resumable import from a separate V2 backup into V3 tables.
// No writes are issued to the source. Old public client IDs never become keys.
const { createClient } = require("@libsql/client");
const { randomUUID } = require("node:crypto");
const { DateTime } = require("luxon");
const { createDatabase } = require("./db.cjs");
const v = require("./validation.cjs");
function parse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
async function importV2(source, target, weekend) {
  const date = DateTime.fromISO(weekend || "", { zone: "America/New_York" });
  v.check(
    date.isValid && date.weekday === 6 && date.toISODate() === weekend,
    "IMPORT_SATURDAY must be an explicit Saturday date, YYYY-MM-DD.",
  );
  const rows = (await source.execute("SELECT * FROM players")).rows;
  const report = {
    read: rows.length,
    imported: 0,
    skipped: 0,
    quarantined: 0,
    events: 0,
  };
  await target.transaction(async (tx) => {
    for (const row of rows) {
      const sourceId = String(row.id);
      if (
        (
          await tx.execute({
            sql: "SELECT source_id FROM v3_imports WHERE source_id=?",
            args: [sourceId],
          })
        ).rows.length
      ) {
        report.skipped++;
        continue;
      }
      let data, board;
      try {
        board = v.boardSlug(row.board || "default");
        data = v.player({
          name: row.name,
          roles: parse(row.roles, null) || [row.role || "DPS"],
          timezone: row.timezone || "America/New_York",
          availability: row.availability ? parse(row.availability, null) : {},
          notes: [
            row.notes,
            row.flex_role && `Legacy flex role: ${row.flex_role}`,
            row.flex_class && `Legacy flex class: ${row.flex_class}`,
          ]
            .filter(Boolean)
            .join("\n"),
          discordName: row.discord_name || "",
          wowClass: row.wow_class || "",
        });
      } catch (error) {
        await tx.execute({
          sql: "INSERT INTO v3_quarantine VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET payload=excluded.payload,reason=excluded.reason",
          args: [sourceId, JSON.stringify(row), error.message],
        });
        report.quarantined++;
        continue;
      }
      const id = randomUUID();
      await tx.execute({
        sql: "INSERT INTO v3_players VALUES(?,?,NULL,?,0,?)",
        args: [
          id,
          board,
          JSON.stringify(data),
          Number(row.created_at) || Date.now(),
        ],
      });
      await tx.execute({
        sql: "INSERT INTO v3_imports VALUES(?,?)",
        args: [sourceId, id],
      });
      const coffee = parse(row.coffee, {});
      for (const [day, enabled, offset] of [
        ["sat", coffee?.attendSat, 0],
        ["sun", coffee?.attendSun, 1],
      ])
        if (enabled) {
          if (!["2-5", "6-9", "10+"].includes(coffee.keyTier)) {
            await tx.execute({
              sql: "INSERT INTO v3_quarantine VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET payload=excluded.payload,reason=excluded.reason",
              args: [
                `${sourceId}:coffee`,
                JSON.stringify(row),
                "Invalid legacy Coffee tier; profile imported, attendance requires organizer review.",
              ],
            });
            report.quarantined++;
            continue;
          }
          const eventId = `import-${board}-${weekend}-${day}`;
          const existing = (
            await tx.execute({
              sql: "SELECT id FROM v3_events WHERE id=?",
              args: [eventId],
            })
          ).rows;
          if (!existing.length) {
            const payload = {
              title: `Coffee & Keys · ${day === "sat" ? "Saturday" : "Sunday"}`,
              startsAt: date
                .plus({ days: offset })
                .set({ hour: 12 })
                .toUTC()
                .toISO(),
              timezone: "America/New_York",
              duration: 120,
            };
            await tx.execute({
              sql: "INSERT INTO v3_events(id,board,payload,status) VALUES(?,?,?,'locked')",
              args: [eventId, board, JSON.stringify(payload)],
            });
            report.events++;
          }
          await tx.execute({
            sql: "INSERT INTO v3_signups VALUES(?,?,?,?)",
            args: [eventId, id, `legacy:${id}`, coffee.keyTier],
          });
        }
      report.imported++;
    }
    // Legacy assignments are deliberately not reused: V2 cannot represent both
    // days and can contain duplicate players. Organizers review fresh proposals.
  });
  return report;
}
if (require.main === module) {
  (async () => {
    v.check(
      process.env.SOURCE_DATABASE_URL &&
        process.env.DATABASE_URL &&
        process.env.SOURCE_DATABASE_URL !== process.env.DATABASE_URL,
      "Set different SOURCE_DATABASE_URL (a V2 backup) and DATABASE_URL (V3 target).",
    );
    const source = createClient({
      url: process.env.SOURCE_DATABASE_URL,
      authToken: process.env.SOURCE_DATABASE_AUTH_TOKEN,
    });
    const target = createDatabase();
    try {
      console.log(
        JSON.stringify(
          await importV2(source, target, process.env.IMPORT_SATURDAY),
          null,
          2,
        ),
      );
    } finally {
      source.close();
      target.close();
    }
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { importV2 };
