# V3 browser verification

Production build served by `audit/preview.cjs` on loopback with an in-memory database and synthetic players.

- Created `V3 Browser Tester` with Tank/Healer capability and no weekly slots. It appeared immediately with a Yours label and edit controls.
- Signed the character up for two distinct dated events. Both displayed their own saved signup and waitlist state to the ordinary member.
- Edited the name to `Draft survives filters`, then switched to Weekly availability. The unsaved name remained intact. Discard explicitly closed the editor.
- Signed in with the fixture organizer token, opened Review groups, and saw one Tank, one Healer, three distinct DPS, and one waiting attendee. Publishing produced the corresponding shared roster without reloading the page.
- At 390×844, content width and available viewport width both measured 375 pixels (the remaining 15 pixels are the vertical scrollbar). No horizontal overflow was present.
- On the `?board=error` fixture, a failed save displayed the HTTP 503 message inline while retaining `Preserved failed-save draft`, its note, and the selected Tank role.
- On the final build, created a dated event using the organizer form and verified its date/time in the roster.
- Generated a synthetic ownership claim, entered it in the member recovery form, and verified that the character acquired a Yours label and its existing event signup became visible under My signup.

These are manual browser observations, not automated end-to-end tests. Automated server and matching checks are under `tests/`. The ownership-claim API and failure edge cases are additionally covered through integration tests.
