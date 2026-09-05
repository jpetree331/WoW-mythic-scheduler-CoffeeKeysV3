# Browser audit observations — September 5, 2026

Target: locally hosted original React app using `audit/preview.cjs`. API `127.0.0.1:4387`; frontend `127.0.0.1:4300`. In-memory fixture database; no real community data or credentials. Browser interactions used Codex's browser-control API. These are manual observations, not automated browser test results.

## F06: Coffee-only signup cannot be seen by its owner

1. Open `?board=audit` as an ordinary member.
2. Enter `Audit Coffee Signup`, select Tank, enable Coffee & Keys, select Saturday and tier 2–5, and submit.
3. The form resets. The normal view still displays `All Players (0)` and `No players have been added yet`.
4. There are no Saturday/Sunday navigation buttons, roster, or owner edit/cancel controls. A seeded Coffee-only fixture is also absent from this view.

## F07: HTTP 503 erases entered data

1. Open `?board=error`.
2. Enter `Audit Keep My Draft`, add note `This should survive a failed save`, select Tank, and add a Monday slot.
3. Submit; the fixture returns HTTP 503.
4. Dismiss `Failed to submit availability. Please try again.`
5. Character name and notes are empty and Monday's slot is gone.

## F07: Parent rerender resets an edit draft

1. On `?board=audit`, create `Audit Weekly Signup`, Tank, Monday 7–9 PM.
2. The saved player appears in `All Players (1)` with Edit and delete controls.
3. Click Edit, change the name to `Audit UNSAVED Draft`, and observe it in the input.
4. Toggle Tank in the results' role filter.
5. The name input changes back to `Audit Weekly Signup`, losing the unsaved edit. This tests the same parent-rerender mechanism that SSE updates can trigger.

## F22: Mobile overflow

Set the browser viewport to 390×844 while the weekly form is open. A horizontal scrollbar appears. Read-only DOM measurement reports `documentElement.clientWidth = 375` and `scrollWidth = 423`; the results' sort select extends beyond the viewport. The 15px difference from the configured width is the vertical scrollbar. The initial form itself is readable, but the filter row needs wrapping/stacking.

The viewport override was reset and the temporary tab closed after inspection. No live site was visited for these interaction tests.
