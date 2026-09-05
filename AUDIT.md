# Coffee & Keys scheduling audit

> Historical V2 baseline. The active V3 application has been repaired; see `REPAIRS.md` and `tests/` for current behavior and verification. Line references below describe the original V2 commit and may no longer match rewritten V3 files. The original failed-check output is preserved as evidence; the audit test entrypoint now runs the repaired integration suite.

Audited September 5, 2026. Repository: [jpetree331/WoW-mythic-scheduler-CoffeeKeysV2](https://github.com/jpetree331/WoW-mythic-scheduler-CoffeeKeysV2). Branch: `master`. Commit: `593cd4570a0b28f4f7fe7e1a53898e8bba4b1e8e`.

**The app needs repairs before its signups and group assignments can be trusted.** The largest problems are authorization bypass, signup data loss, invalid group composition, and weekend assignments overwriting each other. Its current model is a weekly availability board with a weekend grouping feature; it does not yet represent a dated event with confirmed participants.

The repository was cloned into `E:\git\WoW-Scheduler-CoffeeV2` with Git history and the original remote. No separate GitHub fork was created. Application source and the lockfile remain unchanged; this audit adds evidence and tests. No live database was connected, no real community records were modified, and nothing was deployed or pushed.

## Verification and limits

| Check | Result |
| --- | --- |
| Locked dependency installation | `npm ci --ignore-scripts --no-audit --no-fund` succeeded. Install scripts deliberately skipped; this is not verification of the unused `better-sqlite3` native installation. |
| Production build | `npm run build` passed with Vite 6.3.6; JavaScript bundle approximately 305 kB / 94 kB gzip. |
| TypeScript | **Failed:** `AvailabilityForm.tsx:90:114`, TS2339, `length` does not exist on `unknown`. |
| Server syntax | Both CommonJS files passed `node --check`. |
| Audit regression suite | **22 checks: 19 failures, 3 controls passed.** Failures assert desired behavior and demonstrate existing defects; they are not 19 independent vulnerability categories. |
| Browser | Local, disposable signup and error scenarios reproduced hidden Coffee signups, erased failed submissions, and overwritten edit drafts. A 390px mobile viewport also exposed horizontal overflow. |
| Dependency advisories | npm reported 9 affected packages: 8 high, 1 low. Production-only dependency graph: 2 high (`form-data`, `ws`). Package severity is not proof of exploitability in this app. |
| Checked-in SQLite files | Current logical player count was zero. All three database files match the cloned Git bytes at completion. The read-only SQLite inspection updated its shared-memory sidecar; that inspection-only change was restored. |

Reviewed all application components, services, server routes, database operations, six SQL migrations, types, constants, entry files, package/configuration files, and setup documentation. Reviewed the dependency inventory and advisory reports rather than every line of third-party code. There were no existing test scripts or CI workflows in the checkout.

The test harness executes the original server routes and application SQL against an in-memory SQLite database. It substitutes the libSQL transport and the HTTP listener, without rewriting route or query logic. Frontend TypeScript is transpiled for execution; the sparse-group test renders the actual React component. Concurrency and injected-outage tests demonstrate local logic defects, not measured Turso behavior. Remote migration transaction behavior, production credentials, hosting configuration, backups, multi-instance updates, real-world load, and a full accessibility assessment remain unverified.

Evidence: [regression tests](E:/git/WoW-Scheduler-CoffeeV2/audit/regressions.test.cjs), [test output](E:/git/WoW-Scheduler-CoffeeV2/audit/regression-results.txt), [typecheck output](E:/git/WoW-Scheduler-CoffeeV2/audit/typecheck-results.txt), [dependency audit](E:/git/WoW-Scheduler-CoffeeV2/audit/npm-audit.json), [production dependency audit](E:/git/WoW-Scheduler-CoffeeV2/audit/npm-audit-production.json), [browser observations](E:/git/WoW-Scheduler-CoffeeV2/audit/browser-observations.md).

## Findings

P1 means repair before relying on this behavior in the community. P2 means a material correctness, reliability, or usability issue to address next. Conditions and evidence strength are identified below.

### F01 — P1: Reading a board reveals credentials that authorize editing and deletion

**Reproduced.** `rowToPlayer` includes `clientId` in every public player object. `GET /players` returns those objects without authentication, while PATCH and DELETE accept the same value in `X-Client-Id`. An unauthenticated reader can therefore read another person's identifier and delete their signup. The test did exactly this and received HTTP 200. This is an authorization failure, independent of the strength of the random identifier.

Sources: [db.cjs:174](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:174), [server.cjs:229](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:229), [server.cjs:300](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:300), [server.cjs:314](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:314).

Repair: use authenticated accounts and server-side ownership checks, or private high-entropy edit capabilities with only hashes stored server-side. Public IDs must never double as credentials. Existing exposed identifiers must be invalidated; merely hiding them from future responses is insufficient. Replace the frontend's `clientId` equality check with a permission such as `canEdit` returned for the authenticated viewer. The fallback `getClientId() === 'anon'` also creates shared ownership when browser storage is unavailable.

### F02 — P1: An unset admin secret enables a password published in the source

**Reproduced; deployment exposure is conditional.** Without `ADMIN_TOKEN`, the server accepts its hardcoded password. Anyone with that password has server-wide authority across boards, including clearing signups. A configured unique production secret avoids the default-password path; the audit did not inspect deployment settings.

Source: [server.cjs:54](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:54).

Repair: require a nonempty server secret or disable admin routes when none is configured. Rotate any deployed default. Prefer board-scoped organizer membership instead of a global password. Remove contradictory default-password instructions from both READMEs.

### F03 — P1: Both grouping algorithms mishandle flexible roles

**Reproduced in two ways.** Frontend `autoGroup` places flexible players in multiple role queues without removing their other queue entries. One Tank/Healer plus three DPS produced a five-seat group containing only four distinct people. The same problem can duplicate someone across groups. Server-side auto-assignment takes only `roles[0]`: a Tank/Healer, a Tank, and three DPS were split into incomplete groups even though they could form one valid group.

Sources: [coffeeGrouping.ts:17](E:/git/WoW-Scheduler-CoffeeV2/services/coffeeGrouping.ts:17), [server.cjs:385](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:385).

Repair: use one shared role-assignment algorithm with uniqueness by player/account and explicit assigned roles: one tank, one healer, three DPS. Maximize valid groups across the eligible pool, respect preferred roles, and show why someone is waiting. Separate primary role preference from a list whose order currently depends on button-click order. The server must revalidate every saved group.

### F04 — P1: Sunday assignment destroys Saturday assignment

**Reproduced.** `coffee_assignments` uses `player_id` alone as its primary key and upsert conflict target. Assigning the same player on Sunday overwrote their Saturday row. `Player.coffeeAssign` also models only one assignment. The form explicitly allows both days, so the storage model cannot represent a supported signup.

Sources: [db.cjs:114](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:114), [db.cjs:126](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:126), [types.ts:35](E:/git/WoW-Scheduler-CoffeeV2/types.ts:35).

Repair: introduce dated events and a uniqueness constraint such as `(event_id, participant_id)`. A shorter-term repair can use `(player_id, day)`, but it still cannot distinguish different weekends. Update joins, response types, clear/unassign behavior, and the UI together. Adding a composite key alone would make the existing join return duplicate players.

### F05 — P1: Editing even a note erases Coffee signup and class fields

**Reproduced.** The PATCH route builds a partial player containing only general fields. `updatePlayer` writes Coffee, class, flex role, and flex class columns too, converting their missing values to NULL. A notes-only edit removed all those saved fields. New Coffee values submitted by the edit form are also ignored. Assignment rows are left behind, creating inconsistent state.

Sources: [server.cjs:321](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:321), [db.cjs:265](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:265).

Repair: validate and merge every supported patch field, distinguishing omitted fields from explicit clearing. Return the complete updated record. Reconcile assignments when attendance or capabilities change. Test both preservation and intentional removal.

### F06 — P1: Ordinary members cannot see or manage Coffee-only signups

**Reproduced in the browser.** A member submitted Saturday attendance successfully, but the page still said “All Players (0)” and “No players have been added yet.” General visibility requires weekly availability; Coffee tabs and their player list require admin status. The member cannot reach their own Coffee-only entry to edit or cancel, nor see their assigned group.

Sources: [App.tsx:29](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:29), [App.tsx:291](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:291), [App.tsx:359](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:359).

Repair: make event rosters and the member's signup accessible without organizer privileges. Gate mutation controls individually. Show a clear saved confirmation, selected date/time, assigned role/group or waitlist status, and edit/cancel actions.

### F07 — P1: Failed saves and unrelated rerenders discard form input

**Both reproduced in the browser.** The form calls its async parent handler without awaiting success and immediately resets all fields. A simulated HTTP 503 erased the name, note, and time slot. Separately, `App` creates a new `initial` object on each render; the form's `[initial]` effect reloads the original values. Editing a name and toggling a role filter reset that draft. SSE updates can cause the same parent rerender. Canceling edit also has no explicit reset path, and switching from a Coffee record to a non-Coffee record does not clear previous Coffee state.

Sources: [AvailabilityForm.tsx:32](E:/git/WoW-Scheduler-CoffeeV2/components/AvailabilityForm.tsx:32), [AvailabilityForm.tsx:105](E:/git/WoW-Scheduler-CoffeeV2/components/AvailabilityForm.tsx:105), [App.tsx:96](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:96), [App.tsx:356](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:356).

Repair: await a successful save before clearing, propagate failures, disable repeated submission while pending, and preserve drafts. Initialize by a stable edit-record identity; explicitly handle entering, switching, and canceling edits. Use record versions to detect conflicting updates instead of silently replacing input.

### F08 — P1: Unvalidated signups can break an entire board

**Reproduced.** The API accepted `availability: { Monday: {} }` and returned 201. The matcher then threw `slots is not iterable`. Validation currently checks little beyond truthiness and `typeof availability === 'object'`. There is no authoritative validation of role enums, day names, slot bounds, timezones, attendance booleans, tiers, or field lengths. One malformed row can break rendering for everyone loading its board. React has no surrounding error boundary.

Sources: [server.cjs:244](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:244), [matchingService.ts:68](E:/git/WoW-Scheduler-CoffeeV2/services/matchingService.ts:68), [SummaryDisplay.tsx:210](E:/git/WoW-Scheduler-CoffeeV2/components/SummaryDisplay.tsx:210).

Repair: a shared schema for POST/PATCH, strict server validation, normalized slots, bounded strings/arrays, and defensive handling of existing invalid rows. Return useful 400 errors. Add signup limits and rate limiting appropriate to the board's access policy; the 1 MB body limit alone does not limit request count or accumulated records.

### F09 — P1: Overlapping slots count the same person repeatedly

**Reproduced.** Weekly matching pushes the same player for each overlapping availability interval. One tank, one healer, and one DPS with three duplicate slots were reported as a full five-player group. `isFullGroup` tracks array positions, not unique identities. The form allows duplicate slots through repeated “Add Slot.”

Sources: [matchingService.ts:70](E:/git/WoW-Scheduler-CoffeeV2/services/matchingService.ts:70), [matchingService.ts:146](E:/git/WoW-Scheduler-CoffeeV2/services/matchingService.ts:146).

Repair: merge overlapping intervals per participant before matching and use identity-keyed sets in each time bucket. Enforce distinct participants again when constructing a group.

### F10 — P2: DST weeks and midnight labels can display incorrect times

**Reproduced.** On March 8, 2026, two Eastern players entering Sunday noon–1 PM were matched at 1–2 PM. The conversion adds elapsed minutes to midnight on a day whose clock advances, rather than setting the intended local wall-clock hour/minute. `formatTime(1440)` returns “12:00 PM,” labeling midnight as noon. Its minute formatter also turns any nonzero minute into `30`.

Sources: [matchingService.ts:19](E:/git/WoW-Scheduler-CoffeeV2/services/matchingService.ts:19), [matchingService.ts:132](E:/git/WoW-Scheduler-CoffeeV2/services/matchingService.ts:132), [AvailabilityForm.tsx:282](E:/git/WoW-Scheduler-CoffeeV2/components/AvailabilityForm.tsx:282), [constants.ts:14](E:/git/WoW-Scheduler-CoffeeV2/constants.ts:14).

Repair: use an explicit event/reference date, set wall-clock time fields in the source IANA zone, define handling for nonexistent/ambiguous times, and then convert instants. Include actual event dates in Coffee time labels instead of today's offset. Normalize midnight and support end-of-day/overnight availability explicitly. The current selectors stop at 23:30 and cannot express a normal slot ending at midnight. Test spring/fall DST, Arizona, cross-day/week boundaries, and non-half-hour timezone offsets. Ordinary Pacific-to-Eastern midnight crossing passed its control test.

### F11 — P1: Failed batch replacement can erase existing assignments

**Reproduced with an injected write failure.** Batch assignment deletes the day's rows and then performs individual inserts without a transaction. Failure at the first insert left the previous assignments gone. Later failures can leave a partial roster. Multi-step event clearing has similar partial-failure exposure.

Source: [db.cjs:134](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:134).

Repair: validate the complete proposed state first; perform replacement in a supported libSQL write transaction/atomic batch. Broadcast after commit only. Keep a revision and an undoable published snapshot so an organizer can recover an accidental reshuffle.

### F12 — P2: Assignment requests accept inconsistent boards and invalid groups

**Cross-board case reproduced.** A batch addressed to board A accepted a player from board B. Its assignment row was labeled A, while board B's player join still displayed it because the join only checks player ID. There are no database foreign keys or checks for attendance, group capacity, assigned role, valid player existence, or a positive integer group number. Single assignment also permits nonexistent IDs. The caller is already a global admin, so this is a data-integrity defect, not a separate privilege escalation.

Sources: [server.cjs:165](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:165), [server.cjs:195](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:195), [db.cjs:114](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:114), [db.cjs:142](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:142).

Repair: validate board membership and event eligibility for every participant and reject the entire invalid batch. Enforce foreign keys, uniqueness, group capacity, and explicit roles. Cascade or explicitly remove assignments when deleting a signup. Current general player deletion leaves orphan assignment rows.

### F13 — P1: Clearing one Coffee day can delete weekly availability too

**Reproduced.** A player with weekly slots and Saturday-only Coffee attendance was deleted entirely by “Clear Coffee & Keys Sat.” The form can create such mixed records by adding slots before enabling Coffee. The confirmation describes clearing event signups/assignments, not removing the person's weekly schedule.

Source: [db.cjs:347](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:347).

Repair: separate event attendance from player profiles and weekly availability. Clear/cancel only the selected event's attendance and assignments. Prefer archive/undo over destructive resets. Clarify “Clear All” on the general view, which currently preserves Coffee players even when they also have weekly slots.

### F14 — P1: Some database failures escape the request handler

**Reproduced with an injected outage.** DELETE-by-ID and the preauthorization read on PATCH occur outside route try/catch blocks. Board clearing has unguarded awaits too. An outage caused the async request handler to reject instead of producing an HTTP error; the real HTTP listener does not catch that rejection. Under Node's normal unhandled-rejection behavior this can terminate the process. `/health` can still report healthy before a database is initialized or reachable.

Sources: [server.cjs:277](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:277), [server.cjs:300](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:300), [server.cjs:314](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:314), [db.cjs:9](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:9).

Repair: central request error handling, safe 503/500 responses, and a database-backed readiness check. Also reset the cached initialization promise after failure: source inspection shows that a rejected first `getClient()` promise is retained forever, preventing recovery without restart. Distinguish validation failures from database failures; PATCH currently reports some database errors as 400. Avoid sending raw database error messages or logging full player payloads.

### F15 — P2: Live updates stop permanently after the first connection error

**Reproduced at the EventSource boundary.** The client calls `.close()` in `onerror`, disabling normal EventSource reconnection. Contrary to its comment, App has no focus-based resubscription. There is also no reconnect refresh to catch changes missed while disconnected. The server sends no heartbeat; its subscriber map only covers one process.

Sources: [api.ts:143](E:/git/WoW-Scheduler-CoffeeV2/services/api.ts:143), [App.tsx:77](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:77), [server.cjs:342](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:342).

Repair: retain native reconnect or implement bounded retry, refresh after reconnect/focus, and show connection status. Add heartbeat and cleanup/backpressure handling. Use shared event delivery or revision polling if running multiple backend instances. [MDN documents automatic reconnection and the effect of closing EventSource](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

### F16 — P1: Simultaneous submissions can overfill groups

**Reproduced with six concurrent API calls.** Six DPS signups all ended up in group 1. Auto-assignment reads the current roster and writes its decision later without a lock, transaction, or revision check; requests can make decisions from the same old state. There is no database group-size constraint.

Source: [server.cjs:373](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:373).

Repair: serialize assignment changes per event or use a transaction with conflict detection and retry. Make signup creation idempotent. Prefer collecting attendance and then publishing a validated assignment snapshot rather than treating each new signup as an immediate final roster change.

### F17 — P2: Manual assignment menus break when group numbers have gaps

**Reproduced by rendering the component.** With groups 1 and 3, the dropdown lists 1 and 2. “New Group” calculates `count + 1`, which is 3 and therefore collides with an existing group. Manual mutation handlers also lack consistent error feedback and pending state.

Sources: [CoffeeKeysPanel.tsx:42](E:/git/WoW-Scheduler-CoffeeV2/components/CoffeeKeysPanel.tsx:42), [CoffeeKeysPanel.tsx:120](E:/git/WoW-Scheduler-CoffeeV2/components/CoffeeKeysPanel.tsx:120), [CoffeeKeysPanel.tsx:155](E:/git/WoW-Scheduler-CoffeeV2/components/CoffeeKeysPanel.tsx:155).

Repair: use stable server-created group IDs and render actual existing groups. If retaining numeric labels temporarily, enumerate actual indices and choose `max + 1`. Show saved/error state and validate role/capacity when moving someone.

### F18 — P1: Locked dependencies include advisories, with an exposed development server configuration

**Registry-verified, not exploitation-tested.** npm identified nine affected package entries, eight high and one low. Production-only entries are `form-data` and `ws`, both transitive through libSQL dependencies. In particular, `form-data` arrives through a type dependency; its presence does not establish a vulnerable application request path. Review reachability when updating.

Vite 6.3.6 is affected by the maintainer's file-read advisory, and this project's `host: '0.0.0.0'` exposes the dev server on available interfaces. Actual reachability depends on network/firewall settings. This issue concerns the development server, not the static production bundle. The isolated audit preview overrode the host to `127.0.0.1`. [Vite's official advisory](https://github.com/vitejs/vite/security/advisories/GHSA-p9ff-h696-f583).

Sources: [package-lock.json](E:/git/WoW-Scheduler-CoffeeV2/package-lock.json), [vite.config.ts:11](E:/git/WoW-Scheduler-CoffeeV2/vite.config.ts:11).

Repair: update to maintained dependency versions compatible with the chosen Node runtime, regenerate and review the lockfile, rerun build/tests and both audit modes. Bind local development to loopback by default. Do not blindly force major-version audit fixes. The raw reports preserve advisory IDs, version ranges, and links.

### F19 — P2: A green build does not mean the code typechecks

**Reproduced.** `npm run build` runs only Vite; a separate TypeScript check fails in the form. There are no test/typecheck/lint scripts, React/Luxon type packages are absent, and loose compiler settings leave gaps in checking. Many casts to `any` hide API-contract differences.

Sources: [package.json](E:/git/WoW-Scheduler-CoffeeV2/package.json), [tsconfig.json](E:/git/WoW-Scheduler-CoffeeV2/tsconfig.json), [AvailabilityForm.tsx:90](E:/git/WoW-Scheduler-CoffeeV2/components/AvailabilityForm.tsx:90).

Repair: add appropriate types, fix the existing compiler error, then enable stricter checking incrementally. Gate changes on typecheck, focused regression tests, production build, and a few browser flows. Add a supported Node version and reproducible setup instructions.

### F20 — P2: Migration and local-development paths are inconsistent

**Source-confirmed; real Turso migration behavior unverified.** SQL migrations are disabled by default, while `ensureSchema` repeatedly repairs columns and silently catches many failures. The optional migration runner swallows transaction errors. Migration 003 uses SQLite `quote(role)`, producing `['Tank']` rather than JSON `["Tank"]`; current read fallback masks this for legacy single-role records. Switching migrations on after implicit schema changes can repeatedly encounter duplicate-column errors. Neither path creates versioned event or assignment migrations.

Sources: [db.cjs:26](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:26), [db.cjs:37](E:/git/WoW-Scheduler-CoffeeV2/server/db.cjs:37), [003_add_roles.sql:6](E:/git/WoW-Scheduler-CoffeeV2/server/migrations/003_add_roles.sql:6).

The README says migrations run at startup; the server README describes three different storage stories, while the active implementation requires a remote libSQL/HTTP URL and rejects local `file:` URLs. The checked-in SQLite files are unused by this implementation. `better-sqlite3` is installed but unused. `.env` and database files are not generally ignored. The Gemini setup and Vite secret defines are unused template leftovers; no Gemini credential leak was demonstrated.

Repair: one versioned, transactional migration path with startup validation and explicit failures. Support a disposable local database. Remove unused dependencies/template settings, document the actual deployment, and ignore runtime databases and secret env files while keeping an example config. Preserve/backup existing data before schema changes; verify restore and migration on a copy.

### F21 — P2: Client refresh and mutation paths can disagree about the roster

**Source-confirmed race; not forced in the browser.** Creation broadcasts before the POST response, while App independently fetches on the event and appends the returned player. If the refresh completes first, the append duplicates that player in local state. Concurrent refreshes can also finish out of order. The create response excludes its later auto-assignment, so it can temporarily disagree with the refreshed version. Initial load failures only reach the console, and the UI says no players rather than unavailable.

Sources: [server.cjs:259](E:/git/WoW-Scheduler-CoffeeV2/server/server.cjs:259), [App.tsx:46](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:46), [App.tsx:77](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:77), [App.tsx:105](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:105).

Repair: one query cache or identity-keyed reducer; invalidate/refetch after mutations or merge returned records by ID. Coalesce live events and reject stale responses using request generations or revisions. Fetch board settings only when their revision changes. Distinguish loading, empty, stale, and failed states visibly.

### F22 — P2: Mobile layout and accessible controls need attention

**Mobile overflow reproduced; accessibility observations from source and browser structure.** At a 390px viewport, the page had 423px content width versus 375px available content viewport. The sort select extended beyond the viewport. Time selectors and several Coffee selects lack associated labels; remove buttons use only `×`; role/tier toggles do not expose pressed state. The share button announces success without awaiting clipboard permission/success. Admin edit buttons are only shown for entries owned by the same browser, despite API support for admin editing.

Sources: [SummaryDisplay.tsx:122](E:/git/WoW-Scheduler-CoffeeV2/components/SummaryDisplay.tsx:122), [SummaryDisplay.tsx:230](E:/git/WoW-Scheduler-CoffeeV2/components/SummaryDisplay.tsx:230), [AvailabilityForm.tsx:249](E:/git/WoW-Scheduler-CoffeeV2/components/AvailabilityForm.tsx:249), [App.tsx:266](E:/git/WoW-Scheduler-CoffeeV2/App.tsx:266).

Repair: wrap or stack filters and organizer actions at narrow widths; use descriptive labels, `aria-pressed`, inline live status, visible focus, and accessible confirmation dialogs. Await clipboard writes. Compile Tailwind locally instead of depending on a runtime CDN script; its own documentation describes Play CDN as development-only. [Tailwind documentation](https://tailwindcss.com/docs/installation/play-cdn).

## Improvements for this community

These are proposed product changes, not already implemented features. They do not require changing the core React/Node stack.

| Member or organizer need | Recommended behavior |
| --- | --- |
| Know which weekend a signup belongs to | Dated events with start time, event timezone, duration, signup deadline, and open/locked/completed status. Generate recurring weekend events, but keep each occurrence distinct. |
| Sign up quickly | A reusable member/character profile; choose character, primary role, optional flex, key tier, and attendance. Show “My signup” first and preserve a draft until saving succeeds. |
| Know whether a group can actually run | Display five distinct participant seats with assigned roles, group readiness, missing roles, and waitlist reasons. Show unassigned people prominently. |
| Organize without surprising participants | Draft groups, preview changes, validate, then publish a version. Pin confirmed groups; place late arrivals on a waitlist rather than automatically reshuffling confirmed players. |
| Handle cancellations | Self-service cancel, optional ready/check-in state, organizer-approved replacement, and a visible change history. Archive completed events instead of clearing profiles. |
| Coordinate in Discord | Copy a formatted roster, role needs, and localized event timestamp; add calendar export. A bot/reminders can follow after explicit integration and notification choices. |
| Avoid scheduling the same human twice | Separate account/member from character; enforce one active character per person per event, including when alts provide flexible roles. |
| Form compatible groups | Structured key range and relaxed/learning/pushing preference, rather than relying on notes. Optional class/spec utility can inform suggestions, but should be visible and overridable by organizers. |
| Include different timezones | Display event time in the viewer's timezone with the community time alongside it. The existing timezone filter filters people; it does not convert displayed match times. Rename that filter if retained. |
| Make weekly overlap results useful | Add minimum shared duration and show an actual proposed five-person roster. Current results represent changing sets of all available players, potentially more than five, and split whenever someone joins/leaves. |
| Keep access manageable | Member identity and board membership; organizer permissions limited to their community. Decide explicitly whether roster/contact details are public or members-only. |

Recommended data model: boards, members, characters, recurring availability, dated events, event signups, groups, assignments, and change history. Assignment uniqueness should be tied to event and member; assigned character and role should be explicit. Store event instants in UTC plus an IANA zone for recurring local-time rules. Keep weekly availability and event attendance as separate records so clearing an event cannot erase a profile.

Recommended implementation sequence:

1. **Protect signups:** fix F01/F02/F08/F14; check deployed admin configuration; add error handling and a real readiness check. Verify backup/restore before touching persistent data.
2. **Make scheduling correct:** repair F03/F04/F05/F09/F11/F12/F13/F16 and move assignments onto dated events with atomic publication. Turn the related failing tests green.
3. **Make the member workflow complete:** fix F06/F07/F10/F15/F17/F21, add My signup, preserve drafts, and show assignment/waitlist state. Add browser regression coverage for these flows.
4. **Simplify maintenance:** update dependencies, remove unused native SQLite/Gemini/template code, compile CSS, consolidate migrations, add local fixtures and CI, and fix mobile/accessibility problems.
5. **Add community conveniences:** calendar/Discord exports, reminders, check-in, replacements, fairness controls, and event history after the core workflow is reliable.

Avoid a wholesale framework rewrite. Consolidating the two grouping implementations, separating profiles from events, validating shared contracts, and simplifying data fetching will remove more complexity than replacing the stack.

## Additional operational observations

- `/debug/schema` is unauthenticated and returns schema details; disable it in production or restrict it to organizers/operators. Error responses should not expose database internals.
- Public board slugs and open CORS are the current design. They are not a substitute for board membership or a privacy policy for Discord handles and weekly schedules. CORS restrictions alone would not fix F01.
- Assignment writes call `ensureSchema` repeatedly, adding several round trips per player. Move schema work to initialization and batch writes transactionally. Compute overlap results with memoization and coalesce refreshes; do not fetch unchanged board metadata on every signup.
- Pinning/role matching, fairness, minimum dungeon time, no-show policy, and key tiers should be explicit community preferences. No current WoW season rules or class tuning were assumed or externally validated for this audit.
- The checked-in database was logically empty in this checkout. That does not establish that all Git history is free of sensitive data. Historical secret scanning and live backup checks remain separate work.
- Deployment defaults should fail clearly: a frontend missing `VITE_API_BASE` currently points to each visitor's localhost. Document or validate production configuration, and keep development ports bound to loopback.

## Rerunning the evidence

From the repository root, with Node 22.18 or a compatible runtime:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
node node_modules/typescript/bin/tsc --noEmit
node --experimental-sqlite --test audit/regressions.test.cjs
```

The test command currently exits nonzero because the original bugs are present. Three controls establish ordinary fixed-role grouping, Pacific midnight conversion, and rejection of an unrelated owner credential. The audit harness is a repair aid, not a replacement for eventual real libSQL integration tests.

For the disposable browser environment:

```powershell
node --experimental-sqlite audit/preview.cjs
```

Open `http://127.0.0.1:4300/?board=audit`; the audit-only admin password is documented in the preview source. `?board=error` deliberately rejects new submissions with HTTP 503. All records live only in memory. Stop with Ctrl+C. The preview catches outer route errors for containment; F14 is exercised directly against the original handler in the regression suite.
