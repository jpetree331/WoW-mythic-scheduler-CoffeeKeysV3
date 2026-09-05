const { Pool } = require("pg");
const { createHash } = require("node:crypto");

// The shared repository uses positional ? parameters. Only SQL authored in this
// repository reaches this function; user values always travel separately.
function parameters(sql, args = []) {
  let index = 0;
  const text = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === "?" ? `$${++index}` : token,
  );
  if (index !== args.length) throw new Error("SQL parameter count mismatch");
  return { text, values: args };
}

function createPostgresClient(options = {}) {
  const pool =
    options.pool ||
    new Pool({
      connectionString: options.url,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 8000,
      query_timeout: 15000,
      // Do not disable TLS certificate checks; Neon supplies sslmode in its URL.
    });
  pool.on("error", (error) =>
    console.error("Idle database connection:", error.code || error.name),
  );
  if (process.env.VERCEL) require("@vercel/functions").attachDatabasePool(pool);
  const query = (connection, statement) => {
    const { sql, args } =
      typeof statement === "string" ? { sql: statement, args: [] } : statement;
    return connection.query(parameters(sql, args));
  };
  return {
    dialect: "postgres",
    execute: (statement) => query(pool, statement),
    async transaction(mode = "write") {
      const connection = await pool.connect();
      let ended = false;
      try {
        await connection.query(
          mode === "read"
            ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
            : "BEGIN",
        );
        await connection.query("SET LOCAL statement_timeout = '15s'");
        await connection.query("SET LOCAL lock_timeout = '8s'");
        await connection.query(
          "SET LOCAL idle_in_transaction_session_timeout = '15s'",
        );
        // Preserve the single-writer invariant across ALL function instances.
        // Transaction locks work with Neon's transaction-mode pooler. Read
        // snapshots remain concurrent and never observe half-published groups.
        if (mode !== "read")
          await connection.query("SELECT pg_advisory_xact_lock(112867, 3)");
      } catch (error) {
        await connection.query("ROLLBACK").catch(() => {});
        connection.release(error);
        throw error;
      }
      return {
        execute: (statement) => query(connection, statement),
        async commit() {
          await connection.query("COMMIT");
          ended = true;
        },
        async rollback() {
          await connection.query("ROLLBACK");
          ended = true;
        },
        close() {
          connection.release(
            ended ? undefined : new Error("Unfinished transaction"),
          );
        },
      };
    },
    async consumeRateLimit(ip, limit, now = Date.now()) {
      const bucket = Math.floor(now / 60000);
      const key = createHash("sha256").update(`${bucket}:${ip}`).digest("hex");
      const result = await pool.query(
        "INSERT INTO v3_rate_limits(key,bucket,count) VALUES($1,$2,1) ON CONFLICT(key) DO UPDATE SET count=v3_rate_limits.count+1 RETURNING count",
        [key, bucket],
      );
      // No background task is required; old buckets expire on subsequent writes.
      await pool.query("DELETE FROM v3_rate_limits WHERE bucket < $1", [
        bucket - 1,
      ]);
      return result.rows[0].count <= limit;
    },
    close: () => pool.end(),
  };
}
module.exports = { createPostgresClient, parameters };
