# Backend

The maintained setup, deployment, and migration instructions are in the root README.

Use Node 22.18+ within Node 22. `DATABASE_URL` selects PostgreSQL (`pg`) or SQLite/libSQL (`@libsql/client`); local storage defaults to `file:server/data/v3.db`. Vercel requires a PostgreSQL URL and uses `api/handler.js`. See `../VERCEL.md` for Neon configuration. Startup creates versioned V3 tables transactionally and preserves any V2 tables. There is no default admin password, schema-debug endpoint, or implicit legacy import.

All API routes use `/api` and `?board=<slug>`:

| Method | Route                | Access                                                                              |
| ------ | -------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/health`            | Public database readiness                                                           |
| GET    | `/snapshot`          | Public roster, with viewer-specific `canEdit` / `isMine`                            |
| GET    | `/stream`            | Standalone SSE compatibility; Vercel returns 204; current frontend polls            |
| GET    | `/admin`             | Verify organizer token                                                              |
| PATCH  | `/board`             | Organizer; `{title}`                                                                |
| POST   | `/players`           | Private owner key; profile plus `requestId`                                         |
| PATCH  | `/players/:id`       | Owner or organizer; partial profile plus `version`                                  |
| DELETE | `/players/:id`       | Owner or organizer; `{version}`                                                     |
| POST   | `/players/:id/claim` | Organizer; generate single-use recovery code                                        |
| POST   | `/claim`             | Private owner key; `{code}`                                                         |
| POST   | `/events`            | Organizer; `{title,startsAt,timezone,duration}`                                     |
| PUT    | `/events/:id/signup` | Owner or organizer; `{playerId,tier,revision}` or `{playerId,cancel:true,revision}` |
| PUT    | `/events/:id/groups` | Organizer; `{groups,revision}`                                                      |
| PUT    | `/events/:id/status` | Organizer; `{status,revision}`                                                      |

Owner header: `X-Owner-Key`. Organizer header: `Authorization: Bearer <token>`. Group records contain `{id,tier,seats:[{playerId,role}]}`; complete groups require five distinct people and the standard 1/1/3 composition. Empty group lists explicitly clear published assignments without deleting signups. A partial group caused by cancellation remains visible as needing a replacement; fill it before republishing.

400 means validation failure, 401/403 access failure, 404 missing record, 409 stale revision/closed event/conflict, 429 rate limiting, and 503 backend unavailability. Missing revisions cannot bypass conflict detection. Raw database errors and ownership hashes are never sent to callers.
