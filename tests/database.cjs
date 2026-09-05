const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { createDatabase } = require("../server/db.cjs");
const { createPostgresClient } = require("../server/postgres.cjs");

async function testDatabase(options = {}) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || options.client || options.url)
    return createDatabase({ url: ":memory:", ...options });
  // Integration tests create/drop only their own random schema on an explicitly
  // provided loopback test server. Production/Neon URLs are never accepted.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    throw new Error(
      "TEST_DATABASE_URL must point to an isolated loopback PostgreSQL server",
    );
  const schema = "coffee_test_" + randomUUID().replaceAll("-", "");
  const adminPool = new Pool({ connectionString: url });
  const instances = [];
  try {
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    const fork = () => {
      const pool = new Pool({
        connectionString: url,
        options: `-c search_path=${schema}`,
        max: 5,
      });
      const client = createPostgresClient({ pool });
      const db = createDatabase({ client, url });
      instances.push(db);
      return db;
    };
    const db = fork();
    const close = db.close;
    db.forkTestInstance = fork;
    db.testSchema = schema;
    db.testPool = adminPool;
    db.close = async () => {
      await close();
      for (const other of instances.slice(1)) await other.close();
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await adminPool.end();
    };
    return db;
  } catch (error) {
    await adminPool.end();
    throw error;
  }
}
module.exports = { testDatabase };
