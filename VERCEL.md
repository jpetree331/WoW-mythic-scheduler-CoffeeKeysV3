# Deploy Coffee & Keys on Vercel + Neon

The repository supports a Vercel-hosted frontend and Node API with a Neon PostgreSQL database. No separate running server is required. The existing local SQLite/libSQL option still works outside Vercel.

## Setup

1. In Vercel, import `jpetree331/WoW-mythic-scheduler-CoffeeKeysV3`, branch `main`. Use the repository root and the **Vite** preset. The checked-in `vercel.json` sets build command `npm run build`, output directory `dist`, API routing, security headers, and a 60-second function limit. Node is pinned to **22.x** in `package.json`.
2. Add **Neon** from the Vercel Marketplace and connect the database to this project. Use a new database for V3. Place the Vercel function region near your Neon region in Vercel's project settings.
3. Set these **server-side** environment variables for Production before deploying:

   | Variable       | Value                                                                                                                                                                                                      |
   | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL` | Neon's **pooled** PostgreSQL connection string, including its TLS parameters. The hostname normally includes `-pooler`. If the integration supplies a differently named variable, also set `DATABASE_URL`. |
   | `ADMIN_TOKEN`  | A private random organizer token, at least 24 characters.                                                                                                                                                  |

   Generate a token locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Alternatively, use the `ADMIN_TOKENS` board-to-token map described in the README. Never prefix these secrets with `VITE_`. `HOST`, `PORT`, `DATABASE_AUTH_TOKEN`, `VITE_API_BASE`, and `ALLOWED_ORIGINS` are unnecessary for this same-origin deployment.

4. Deploy or redeploy after setting the variables. On the first database request the app creates its versioned `v3_*` tables transactionally. The database role needs permission to create tables, indexes and sequences. Concurrent cold starts are protected by a database transaction lock. No separate migration command is needed for a fresh V3 database.
5. Open `https://YOUR-APP.vercel.app/api/health`; expect HTTP 200 and `{"ok":true}`. Open `https://YOUR-APP.vercel.app/?board=your-community`. Sign in as organizer, create an event, add a test character and signup, then confirm they remain after a reload. Check signup cancellation and group publication before sharing the community link.

For Preview deployments, connect a separate Neon branch/database and use a different organizer token. Configure both variables for that environment as well. A different `board` query parameter is not a replacement for separating preview and production databases. The repository does not provision hosting, create Neon resources, or copy live community data automatically.

## What changed for hosting

- `api/handler.js` exports an awaited Vercel request handler; `vercel.json` routes `/api/*` to it while Vercel serves `dist`.
- `server/postgres.cjs` uses `pg` with a small reusable pool and Vercel's `attachDatabasePool` lifecycle helper. Use Neon's pooled URL. TLS settings come from the connection string; certificate checking is not disabled in code.
- PostgreSQL uses a separate schema migration with 64-bit timestamps, generated history IDs, cascading foreign keys, uniqueness constraints, and shared write-rate counters. SQLite SQL remains available for local use.
- All scheduling writes acquire the same transaction-scoped advisory lock. This intentionally preserves the prior single-writer behavior for a community-sized app, including stale-revision checks, signup uniqueness, idempotency, recovery and atomic publication. Reads use repeatable-read snapshots. A future large multi-community service could narrow locks by board after equivalent concurrency testing.
- Members see their own saves immediately. Visible pages check for other members' changes every 30 seconds and refresh on focus, reconnect and returning to the tab. Hidden tabs do not poll. The Vercel `/api/stream` endpoint returns 204; it never holds a function open.
- The 90-writes-per-minute limit uses PostgreSQL counters shared by all Vercel instances and the platform's client-IP header. Counters contain a rotating hash, not a raw IP. Old counters are removed on subsequent writes. This is application throttling; configure Vercel Firewall separately if your traffic requires broader abuse protection.
- API responses are never publicly cached because snapshots include viewer permissions. Missing PostgreSQL configuration fails with a safe 503 rather than falling back to an ephemeral local database.

## Existing data

For V2 data, follow the backup/restore and explicit import procedure in `README.md`, using the Neon connection string as the target `DATABASE_URL`. Run the importer locally against a separately restored V2 backup. It is tested with a SQLite source and PostgreSQL target, preserves the source, and requires organizer ownership claims for imported characters.

Changing `DATABASE_URL` does not copy an existing V3 SQLite/libSQL database. If you already put real users on that V3 database, preserve it and plan a separate transfer of all V3 tables and ownership hashes before switching traffic. Do not run the V2 importer against V3 records.

## Verification and troubleshooting

`npm run check` runs the SQLite-compatible tests, strict TypeScript and production build. PostgreSQL integration tests additionally run when `TEST_DATABASE_URL` points to an isolated **loopback** PostgreSQL server. They create and drop only randomly named `coffee_test_*` schemas; do not use production credentials for tests. GitHub Actions provisions a disposable PostgreSQL service and runs the full suite against it.

The optional `audit/verify-vercel-build.cjs` checks routing with Vercel's routing utilities and packages a clean source copy with the official Node builder. It checks that PostgreSQL code/migrations are present and local database files are absent. Its install command is documented at the top of the script; dependencies/output live under ignored `.audit-cache`.

If `/api/health` returns 503, check `DATABASE_URL`, Neon connectivity/TLS and database permissions in Vercel's server logs. If the page loads but `/api/*` returns HTML, confirm the project root and checked-in rewrite configuration. If organizers cannot sign in, confirm the token is set in the correct environment and redeploy. Drafts remain available after failed saves.

Local PostgreSQL tests and package checks cannot verify your actual Vercel account settings, Neon credentials, TLS path or hosted deployment. Complete step 5 on your deployed URL.

Official references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Node request handling](https://vercel.com/docs/functions/runtimes/node-js), [connection pools on Vercel](https://vercel.com/kb/guide/connection-pooling-with-functions), [Neon integration](https://vercel.com/marketplace/neon/neon), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [PostgreSQL transaction locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).
