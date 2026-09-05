# V3 repair and release record

## Vercel + Neon update

Runtime-startup correction: the CommonJS validator previously required the ESM grouping module during startup. With synchronous `require(ESM)` disabled, this throws before the API error handler is loaded. Shared role/tier values now live in JSON, loaded natively by both module formats. The regression suite starts a fresh Node process with `--no-experimental-require-module`; the packaging check also executes the exact bundled files outside the workspace under that restriction, including PostgreSQL/Vercel helper loading and safe missing-database responses.

Deployment-import correction: changed `functions.api/handler.js.excludeFiles` from an array to a single brace-expansion glob string. The prior lower-level builder check did not validate the project-import schema. CI and the optional packaging check now validate the full configuration against Vercel's live schema, including rejection of the original invalid array.

V3 now includes a Vercel Node request handler, PostgreSQL adapter and schema, shared rate limiting, transaction locks across instances, and visible-tab polling. See `VERCEL.md` for deployment settings and limitations. No live database or hosting configuration has been changed.

PostgreSQL integration tests cover concurrent cold starts, stale edit/signup/publication races across separate pools, actual SQL-error rollback, consistent snapshots, shared rate counters, V2 import and authenticated Vercel entrypoint requests. The official Vercel Node builder packages a clean source copy; `audit/vercel-package.json` records the routing and migration inclusion checks. Current test evidence is in `audit/vercel-postgres-tests.txt` and `audit/vercel-check.txt`.

Validation: all 47 tests pass with isolated PostgreSQL 18; the SQLite run passes 41 and skips the six PostgreSQL-only cases. Strict TypeScript and the production build pass, and the full dependency audit reports zero vulnerabilities. The clean-copy Vercel build produces the same frontend assets as the local build. Browser verification confirmed both dated events, the new auto-refresh status, correct page styling and no horizontal overflow at the checked desktop viewport. Hosted Neon/Vercel checks remain the operator's final deployment step.

## Original V3 release

V2 baseline: `593cd4570a0b28f4f7fe7e1a53898e8bba4b1e8e`. V3 replaces the exposed-ID ownership scheme and recurring-day assignment model while retaining React, TypeScript, Node and libSQL. All 22 audit finding categories have been addressed in the active application; the original audit is retained as a baseline record.

| Finding | Repair                                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F01     | Private random edit keys, server-side hashes, viewer permissions; old IDs grant no access.                                                   |
| F02     | No default organizer token; optional board-specific tokens and short-token startup validation.                                               |
| F03     | Shared augmenting-path role matching; distinct members and explicit role seats.                                                              |
| F04     | Independent dated events, signups and assignments; both weekend days are preserved.                                                          |
| F05     | Validated partial profile merge; events are separate; capability changes invalidate affected seats.                                          |
| F06     | Public event rosters and My signup with owner edit/cancel controls.                                                                          |
| F07     | Awaited saves, pending controls, retained session drafts, stable edit mounting, version conflicts.                                           |
| F08     | Server schemas, bounded payloads/boards, defensive reads, quarantine and a UI error boundary.                                                |
| F09     | Identity-deduplicated interval matching and overlap normalization.                                                                           |
| F10     | Calendar wall-clock conversion, explicit reference week, precise minutes, midnight option, dated event exports.                              |
| F11     | Atomic transaction for group publication and history; rollback tested after an injected write failure.                                       |
| F12     | Board/attendance/tier/role validation, foreign keys, unique member/event and cascading cleanup.                                              |
| F13     | Per-event cancellation and archive instead of broad Coffee clearing; profiles preserved.                                                     |
| F14     | Central HTTP exception handling, database readiness, retryable initialization, safe error responses.                                         |
| F15     | Native SSE reconnection, heartbeat, cleanup, focus refresh and polling for missed/multi-instance changes.                                    |
| F16     | Explicit reviewed publication; serialized transactions, required revisions and idempotent character creation.                                |
| F17     | Stable group IDs and explicit seat editor; sparse IDs preserved.                                                                             |
| F18     | Updated dependencies/lockfile; loopback development; unused native SQLite removed.                                                           |
| F19     | Strict TypeScript, appropriate type packages, tests/build in CI.                                                                             |
| F20     | Separate versioned schema, local libSQL, explicit tested V2 import; obsolete setup and AI settings removed.                                  |
| F21     | One serialized/coalesced snapshot refresh path; no optimistic duplicate append; visible outage state.                                        |
| F22     | Responsive controls, labels and pressed state, destructive-action confirmation with focus handling, awaited clipboard actions, compiled CSS. |

## Evidence

- `npm run check`: 36 tests passing at release verification, strict typecheck and production build successful.
- `tests/results.txt`: captured verification output (updated during release checks).
- `audit/npm-audit-v3*.json`: current full and production-only dependency reports.
- `audit/browser-v3.md`: browser verification observations.
- Tests use real in-memory libSQL, actual loopback HTTP, and injected transaction failures. No live community database was used.
- The V2 import test fingerprints source rows before/after and verifies both event days, single-role JSON repair, quarantine, idempotent re-import, and invalidated legacy credentials. A separate test confirms V3 schema initialization preserves an existing V2 table.

## Scope and remaining limits

The code is ready to be configured and deployed from the V3 repository; pushing source is not a hosting deployment. Production backup/restore, provider-specific settings, remote libSQL failure behavior and multi-instance performance still need deployment checks. The live V2 service/database have not been changed.

Private edit keys offer account-free ownership, not verified community identity. Different keys can represent the same human; real Discord/account membership requires a separate authentication integration. Public roster/contact visibility is explicit. Organizer-generated, expiring single-use claims provide recovery and migration ownership transfer.

Automatic groups maximize complete role compositions within each tier; they do not yet optimize fairness, rating, class utility or friendships. Review remains an organizer decision. Calendar and Discord exports are included; automated reminders, bot integration, and check-in are not part of this release.

Group history is retained in the database for operator recovery; there is no automatic history-restore UI. Archived events preserve their records, but explicitly removing a character also removes that character's signups as the confirmation states. The old V2 recurring-day assignments are intentionally replaced by reviewed V3 proposals.

No software audit can establish that every possible defect has been eliminated. The repairs cover the identified findings and the checked workflows; the evidence and remaining deployment checks are recorded here for handoff.
