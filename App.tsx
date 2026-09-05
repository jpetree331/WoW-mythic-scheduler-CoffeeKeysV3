import { useCallback, useEffect, useRef, useState } from "react";
import type { Player, Snapshot } from "./types";
import AvailabilityForm from "./components/AvailabilityForm";
import CoffeeKeysPanel from "./components/CoffeeKeysPanel";
import SummaryDisplay from "./components/SummaryDisplay";
import EventCreator from "./components/EventCreator";
import { PlayerName, RoleLabels } from "./components/RoleText";
import {
  adminToken,
  board,
  fetchSnapshot,
  ownerKey,
  request,
  restoreKey,
  setAdminToken,
  subscribeToUpdates,
} from "./services/api";

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<"events" | "weekly">("events");
  const [editor, setEditor] = useState<{ player?: Player; session: number }>();
  const [showAdmin, setShowAdmin] = useState(false),
    [password, setPassword] = useState("");
  const [showKeys, setShowKeys] = useState(false),
    [keyInput, setKeyInput] = useState("");
  const [claimInput, setClaimInput] = useState(""),
    [claimCode, setClaimCode] = useState("");
  const [showArchive, setShowArchive] = useState(false),
    [deleting, setDeleting] = useState<Player>();
  const [busy, setBusy] = useState(false),
    [titleDraft, setTitleDraft] = useState("");
  const mounted = useRef(true),
    pending = useRef(false),
    flight = useRef<Promise<void> | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!deleting) return;
    const previous = document.activeElement as HTMLElement | null;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setDeleting(undefined);
      if (e.key === "Tab") {
        const buttons = [
          ...(dialogRef.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) || []),
        ];
        const first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [deleting, busy]);
  const refresh = useCallback((): Promise<void> => {
    pending.current = true;
    if (flight.current) return flight.current;
    flight.current = (async () => {
      do {
        pending.current = false;
        try {
          const next = await fetchSnapshot();
          if (mounted.current) {
            setSnapshot(next);
            setConnected(true);
            setError("");
          }
        } catch (e) {
          if (mounted.current) setConnected(false);
          if (mounted.current)
            setError(e instanceof Error ? e.message : "Unable to refresh.");
        }
      } while (pending.current && mounted.current);
    })().finally(() => {
      flight.current = null;
    });
    return flight.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const stop = subscribeToUpdates(() => {
      void refresh();
    });
    return () => {
      mounted.current = false;
      stop();
    };
  }, [refresh]);
  const players = snapshot?.players || [],
    isAdmin = !!snapshot?.isAdmin;
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(success);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex flex-col md:flex-row gap-5 justify-between mb-6">
        <div>
          <p className="text-amber-400 text-sm font-bold tracking-widest uppercase">
            Community Mythic+
          </p>
          <h1 className="text-4xl font-bold mt-2 text-amber-200 break-words">
            {snapshot?.title || "Coffee & Keys"}
          </h1>
          <p className="text-slate-400 mt-2">
            Find your people. Make time for keys.
          </p>
          <p className="muted mt-2">
            Board: {board} ·{" "}
            {connected
              ? "Auto-refresh every 30 seconds"
              : "Reconnecting · checking every 30 seconds"}
          </p>
        </div>
        <div className="flex flex-wrap content-start gap-2">
          <button
            className="btn"
            onClick={() =>
              action(
                () => navigator.clipboard.writeText(window.location.href),
                "Board link copied.",
              )
            }
          >
            Share board
          </button>
          <button className="btn" onClick={() => setShowKeys((s) => !s)}>
            My edit key
          </button>
          <button
            className="btn"
            onClick={() => {
              if (isAdmin) {
                setAdminToken("");
                setNotice("Organizer signed out.");
                void refresh();
              } else setShowAdmin((s) => !s);
            }}
          >
            {isAdmin ? "Sign out organizer" : "Organizer sign-in"}
          </button>
        </div>
      </header>
      <div aria-live="polite" className="mb-4">
        {notice && (
          <p className="rounded-lg border border-emerald-800 bg-emerald-950 text-emerald-200 p-3">
            {notice}
          </p>
        )}
      </div>
      {error && (
        <div className="error mb-4" role="alert">
          <p>{error}</p>
          <button className="btn mt-2" onClick={() => void refresh()}>
            Retry refresh
          </button>
        </div>
      )}
      {showAdmin && !isAdmin && (
        <form
          className="panel mb-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              setAdminToken(password);
              try {
                await request("/admin");
                setShowAdmin(false);
                setPassword("");
              } catch (e) {
                setAdminToken("");
                throw e;
              }
            }, "Organizer signed in for this tab.");
          }}
        >
          <label htmlFor="admin-token" className="label">
            Organizer access token
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="off"
            className="field"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="muted">
            The organizer token is configured on the server. There is no default
            password.
          </p>
          <button className="btn primary" disabled={busy}>
            Sign in
          </button>
        </form>
      )}
      {showKeys && (
        <section className="panel mb-4 space-y-3">
          <h2 className="font-bold">Keep access to your characters</h2>
          <p className="muted">
            Your private edit key controls your characters. Save it somewhere
            private to restore access on another browser. Never post it with
            your board link. For an older character, ask an organizer for a
            claim code.
          </p>
          <button
            className="btn"
            onClick={() =>
              action(
                () => navigator.clipboard.writeText(ownerKey()),
                "Private edit key copied. Save it securely.",
              )
            }
          >
            Copy my private edit key
          </button>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                restoreKey(keyInput);
                setEditor(undefined);
                setKeyInput("");
              }, "Edit key restored.");
            }}
          >
            <label htmlFor="restore-key" className="label">
              Restore a saved edit key
            </label>
            <input
              id="restore-key"
              type="password"
              autoComplete="off"
              className="field"
              required
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button className="btn" disabled={busy}>
              Restore access
            </button>
          </form>
        </section>
      )}
      {!snapshot ? (
        <p className="panel" role="status">
          {error
            ? "The board is unavailable. Your drafts are preserved."
            : "Loading the community board…"}
        </p>
      ) : (
        <>
          {showKeys && (
            <form
              className="panel mb-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await request("/claim", "POST", { code: claimInput });
                  setClaimInput("");
                }, "Character access restored to this browser.");
              }}
            >
              <label className="label" htmlFor="claim-code">
                Claim a migrated character
              </label>
              <p className="muted">
                Ask an organizer for a single-use claim code. It expires after
                24 hours.
              </p>
              <input
                className="field"
                id="claim-code"
                type="password"
                autoComplete="off"
                value={claimInput}
                required
                onChange={(e) => setClaimInput(e.target.value)}
              />
              <button className="btn" disabled={busy}>
                Claim character
              </button>
            </form>
          )}
          {isAdmin && claimCode && (
            <section className="panel mb-4 space-y-2">
              <h2 className="font-bold">Single-use ownership claim</h2>
              <p className="muted">
                Share this code privately with the character's owner. It allows
                them to take over editing and expires in 24 hours.
              </p>
              <code className="block break-all">{claimCode}</code>
              <button
                className="btn"
                onClick={() =>
                  action(
                    () => navigator.clipboard.writeText(claimCode),
                    "Claim code copied.",
                  )
                }
              >
                Copy claim code
              </button>
              <button className="btn ml-2" onClick={() => setClaimCode("")}>
                Hide code
              </button>
            </section>
          )}
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              className={`btn ${tab === "events" ? "primary" : ""}`}
              aria-pressed={tab === "events"}
              onClick={() => setTab("events")}
            >
              Dated events
            </button>
            <button
              className={`btn ${tab === "weekly" ? "primary" : ""}`}
              aria-pressed={tab === "weekly"}
              onClick={() => setTab("weekly")}
            >
              Weekly availability
            </button>
            <button
              className="btn"
              onClick={() => setEditor({ session: Date.now() })}
            >
              Add my character
            </button>
          </div>
          <main className="grid lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)] gap-6 items-start">
            <aside className="space-y-5">
              {editor && (
                <AvailabilityForm
                  key={editor.session}
                  initial={editor.player}
                  onCancel={() => setEditor(undefined)}
                  onSave={async (data) => {
                    await request(
                      editor.player
                        ? `/players/${editor.player.id}`
                        : "/players",
                      editor.player ? "PATCH" : "POST",
                      data,
                    );
                    setEditor(undefined);
                    setNotice("Character saved. Choose an event to sign up.");
                    await refresh();
                  }}
                />
              )}
              <section className="panel">
                <h2 className="font-bold text-xl text-amber-300">
                  Characters ({players.length})
                </h2>
                <p className="muted mt-2">
                  Your characters appear first. Everyone can see the roster;
                  only you and organizers can change your entries.
                </p>
                <ul className="divide-y divide-slate-700 mt-3">
                  {[...players]
                    .sort((a, b) => Number(b.isMine) - Number(a.isMine))
                    .map((p) => (
                      <li className="py-4 space-y-2" key={p.id}>
                        <h3 className="font-semibold break-words">
                          <PlayerName player={p} />{" "}
                          {p.isMine && (
                            <span className="text-xs text-emerald-300">
                              · Yours
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-slate-300">
                          <RoleLabels roles={p.roles} />
                          {p.wowClass && ` · ${p.wowClass}`}
                        </p>
                        {p.discordName && (
                          <p className="muted break-words">
                            Discord: {p.discordName}
                          </p>
                        )}
                        {p.notes && (
                          <p className="muted break-words">{p.notes}</p>
                        )}
                        {p.canEdit && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="btn text-sm"
                              onClick={() =>
                                setEditor({ player: p, session: Date.now() })
                              }
                            >
                              Edit {p.name}
                            </button>
                            <button
                              className="btn text-sm"
                              onClick={() => setDeleting(p)}
                            >
                              Remove
                            </button>
                            {isAdmin && (
                              <button
                                disabled={busy}
                                className="btn text-sm"
                                onClick={() =>
                                  action(async () => {
                                    const result = await request<{
                                      code: string;
                                    }>(`/players/${p.id}/claim`, "POST", {});
                                    setClaimCode(result.code);
                                  }, "Ownership claim generated.")
                                }
                              >
                                Create ownership claim
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
                {players.length === 0 && (
                  <p className="muted mt-4">
                    No characters yet. Add yours to get started.
                  </p>
                )}
              </section>
              {isAdmin && (
                <form
                  className="panel space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(
                      () => request("/board", "PATCH", { title: titleDraft }),
                      "Board title saved.",
                    );
                  }}
                >
                  <label className="label" htmlFor="board-title">
                    Board title
                  </label>
                  <input
                    className="field"
                    id="board-title"
                    placeholder={snapshot.title}
                    value={titleDraft}
                    required
                    maxLength={100}
                    onChange={(e) => setTitleDraft(e.target.value)}
                  />
                  <button className="btn" disabled={busy}>
                    Save title
                  </button>
                </form>
              )}
            </aside>
            <div className="space-y-5 min-w-0">
              {tab === "weekly" ? (
                <SummaryDisplay players={players} />
              ) : (
                <>
                  {isAdmin && (
                    <EventCreator
                      onCreate={async (input) => {
                        await request("/events", "POST", input);
                        setNotice("Event created. Members can now sign up.");
                        await refresh();
                      }}
                    />
                  )}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showArchive}
                      onChange={(e) => setShowArchive(e.target.checked)}
                    />
                    Show archived events
                  </label>
                  {snapshot.events
                    .filter((e) => showArchive || e.status !== "completed")
                    .map((event) => (
                      <CoffeeKeysPanel
                        key={event.id}
                        event={event}
                        players={players}
                        isAdmin={isAdmin}
                        refresh={refresh}
                        notice={setNotice}
                      />
                    ))}
                  {!snapshot.events.some(
                    (e) => showArchive || e.status !== "completed",
                  ) && (
                    <section className="panel">
                      <h2 className="text-xl font-bold">
                        The next keys are brewing
                      </h2>
                      <p className="muted mt-2">
                        An organizer can create the next dated event. In the
                        meantime, save your character and weekly availability.
                      </p>
                      {!snapshot.adminConfigured && (
                        <p className="muted mt-3">
                          Organizer access has not been configured for this
                          board yet.
                        </p>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </main>
        </>
      )}
      {deleting && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <section
            ref={dialogRef}
            className="panel max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-title"
          >
            <h2 className="text-xl font-bold" id="remove-title">
              Remove {deleting.name}?
            </h2>
            <p className="mt-3 mb-5">
              This removes the character, weekly availability, and its event
              signups. To cancel only one event, use “Cancel my signup” on that
              event instead.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                autoFocus
                disabled={busy}
                className="btn"
                onClick={() => setDeleting(undefined)}
              >
                Keep character
              </button>
              <button
                disabled={busy}
                className="btn danger"
                onClick={() =>
                  action(async () => {
                    await request(`/players/${deleting.id}`, "DELETE", {
                      version: deleting.version,
                    });
                    if (editor?.player?.id === deleting.id)
                      setEditor(undefined);
                    setDeleting(undefined);
                  }, "Character removed.")
                }
              >
                Remove character
              </button>
            </div>
          </section>
        </div>
      )}
      <footer className="muted mt-10 border-t border-slate-800 pt-5">
        Coffee & Keys · Built for community runs, learning together, and one
        more key.
      </footer>
    </div>
  );
}
