# Coffee & Keys V3

A community Mythic+ scheduler: save a character, sign up for a dated event, and review five-person groups before publishing them. React + TypeScript, Node.js, and PostgreSQL or libSQL. No AI service, Discord bot, or external identity provider is required.

**Vercel + Neon:** follow [VERCEL.md](VERCEL.md) to deploy the complete app from this repository. API routing, PostgreSQL support and serverless-safe refresh are included.

## What members can do

- Save characters, class, playable roles, optional Discord contact, notes, and recurring weekly availability.
- Sign up for Saturday and Sunday independently, with one character per person per event.
- See their signup, published role/group, or waitlist status immediately.
- Edit or cancel their own entries with a private browser edit key; restore access on another browser using that key.
- Export a dated calendar entry or copy a Discord-ready roster.
- Explore exact weekly overlaps with minimum-duration and complete-group filters.

Organizers can create dated events, close/reopen signups, archive events without clearing profiles, edit entries, and create a reviewed group proposal. Proposals use flexible-role matching and can be adjusted manually. Publishing is atomic and rejects stale proposals, duplicates, wrong roles, mismatched tiers, and cross-board players. Changing a role or canceling attendance removes only the affected assignment and flags the group as needing a replacement.

## Run locally

Use Node.js **22.18 or later within Node 22**. From the project directory:

```sh
npm ci
npm run check
npm run build
npm start
```

Open [the local app](http://127.0.0.1:8787/?board=default). The server serves the built frontend and API from the same origin. The default database is the ignored, persistent `server/data/v3.db`; the old checked-in `app.db` is not used.

For frontend development, keep `npm run server` running and run `npm run dev` in another terminal. Open [the development app](http://127.0.0.1:3000/?board=default); Vite proxies `/api` to port 8787. Development binds only to loopback.

Copy `.env.example` to `.env` to configure the app. Node loads `.env` for the server; Vite loads frontend variables for builds. Runtime env files and database files are ignored by Git.

## Organizer access and member recovery

There is **no default organizer password**. Generate a random token and set `ADMIN_TOKEN` in `.env` or your hosting service, then restart the backend:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the resulting value (at least 24 characters) in Organizer sign-in. The token is kept in the current browser tab's session storage. It grants organizer access across boards on that server. For multiple independent communities, use `ADMIN_TOKENS`, a JSON map of board slug to private token, and leave the shared `ADMIN_TOKEN` empty.

Member edit keys are generated with cryptographic randomness, stored locally, and sent in `X-Owner-Key`. Only a hash is stored in the database, and neither the key nor its hash is returned in roster responses. Save your key privately using **My edit key**. If storage is unavailable, the app uses a private in-memory key; save it before closing the browser. These keys represent browser identities, not verified Discord accounts: people using unrelated keys cannot automatically be recognized as the same human.

For a lost key or imported V2 character, an organizer can choose **Create ownership claim** next to the character. Share that single-use code privately with its owner; they enter it under My edit key → Claim a migrated character. Codes expire after 24 hours. V2's publicly exposed `clientId` values intentionally confer no authority in V3.

Board links are public rosters, not private membership gates. Names, roles, notes and any supplied Discord handle are visible to people who can access the board. Do not put private information in notes. Full account/Discord authentication can be added separately if membership gating is desired.

## Deploy

For Vercel + Neon, use [the Vercel deployment guide](VERCEL.md). Set `DATABASE_URL` to Neon's pooled PostgreSQL URL and set an organizer token. Vercel serves the frontend and the request-based API together.

### Standalone Node hosting

The simplest deployment is one Node service serving both the frontend and API:

1. Build command: `npm ci && npm run build`.
2. Start command: `npm start`.
3. Set `HOST=0.0.0.0` and the platform-provided `PORT`.
4. Set `DATABASE_URL` to a PostgreSQL URL (including TLS parameters), a remote libSQL URL with `DATABASE_AUTH_TOKEN`, or mount durable storage and use a local `file:` URL.
5. Set a private `ADMIN_TOKEN` or `ADMIN_TOKENS`.
6. Configure the health probe to `GET /api/health`; it checks the database and returns 503 during an outage.
7. Use HTTPS and verify creating/editing/canceling an isolated test signup before inviting the community.

Do not run the Vite development server as the public production server. Tailwind is compiled into the build; no runtime styling CDN is required.

For a separate static frontend, build with `VITE_API_BASE=https://your-backend.example/api`, and configure `ALLOWED_ORIGINS=https://your-frontend.example` on the backend. The backend's own static-serving CSP assumes the default same-origin arrangement; the separate frontend host must supply its own appropriate CSP. Backend configuration never belongs in `VITE_` variables.

The frontend refreshes immediately after its own writes and polls for other members' changes every 30 seconds while visible, also refreshing on focus/reconnect. PostgreSQL transaction locks and record revisions protect concurrent writes across server instances. Vercel uses shared database rate counters; standalone hosting uses a per-process 90-writes-per-minute connection-IP limit and may need proxy-aware gateway throttling. The optional standalone SSE endpoint remains compatible with older clients; the current frontend does not use it.

## Import existing V2 data safely

V3 does **not** auto-import or rewrite V2 tables. It creates separate `v3_*` tables through a versioned transaction. The legacy SQL files 001–006 are retained as reference; the V3 runner executes only its own migration.

1. Take a consistent V2 backup using your database provider's snapshot/export tools, or a SQLite online backup. Do not copy only the main file from a running WAL database.
2. Restore that backup separately and verify its player count and representative entries. Preserve the original backup.
3. Create a separate V3 database and configure these environment variables:

```dotenv
SOURCE_DATABASE_URL=file:server/data/v2-restored-backup.db
DATABASE_URL=file:server/data/v3.db
IMPORT_SATURDAY=2026-09-12
```

4. Choose the actual Saturday that legacy recurring attendance should map to, then run `npm run import:v2`.
5. Inspect the import report and `v3_quarantine` for records requiring repair. Re-running the import skips already-imported source IDs. Use one V2 source dataset per target database.
6. Review imported events, issue ownership claims, rebuild valid groups, then open signups. Imported events start locked. The old assignments are not reused because V2 could overwrite days and duplicate players.
7. Verify backup/restore for V3 and compare source fingerprints before switching the community link. Keep the prior service and database available for rollback until the cutover is verified.

The importer reads from the source and writes only to the target. It preserves weekly availability and supported profile fields; legacy flex information is retained in notes. Invalid rows are quarantined with their original payload and reason instead of silently discarded. Legacy board titles can be set by the organizer in V3. The import does not reactivate old public ownership credentials.

No production database migration or hosting deployment is performed by pushing this repository.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm audit
```

The suite uses real libSQL and PostgreSQL drivers, disposable databases, and actual HTTP requests. It covers authorization, date/role matching, validation, rollback, concurrency, migration, idempotency, claims, polling cleanup, Vercel request handling, and calendar output. GitHub Actions runs SQLite and PostgreSQL jobs, typecheck/build, and dependency auditing. See `VERCEL.md` for PostgreSQL test configuration.

For a disposable browser preview, build first and run `node audit/preview.cjs`, then open [the preview](http://127.0.0.1:4300/?board=audit). Its fixture organizer token is `audit-only-organizer-secret-123456`; it has no connection to production credentials or data. `?board=error` intentionally rejects character creation to test preserved drafts. Stop with Ctrl+C.

See `REPAIRS.md` for the audit-to-repair mapping and validation limits. `AUDIT.md` and the original audit result files describe the V2 baseline, not the current V3 behavior.
