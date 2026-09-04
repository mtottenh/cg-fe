# UX walkthroughs

How to look at this product the way its users do, and write up what you find.

The first pass of this (September 2026, after players reported the site was
confusing) produced findings that a careful read of the components had *missed*
— and corrected two that the read got wrong. That asymmetry is the argument for
the whole exercise: **reading the code tells you what the app does; only the
screenshots tell you what the page says.**

Two examples from that pass, neither visible in the source:

- The league page opens on the league's *emptiest* season, so a live league
  introduces itself with "No Teams Yet". The selection logic reads perfectly
  sensibly in isolation — prefer an `active` season, else the first in the list.
- "Tournaments" and "Teams" sit under one season control, in identical styling,
  and only one of them obeys it. On screen that reads as `Tournaments 1` next to
  `Teams 0` in a season containing neither.

---

## 1. Bring the stack up

You need Docker, Node, and a Rust toolchain. Everything else the scripts do.

```bash
cd web
./scripts/ux-stack.sh up        # postgres + api + vite, prints URLs and the admin login
./scripts/ux-stack.sh status
./scripts/ux-stack.sh down      # when you are finished
```

The first run builds the API (several minutes, cached afterwards). Ports are
`5441` / `3007` / `5180`, chosen to sit outside the e2e range so a test run and
a walk can coexist.

This is **not** `e2e-ephemeral.sh`. That script tears its stack down when
Playwright exits, which is correct for tests and useless here — you cannot click
through a stack that no longer exists.

### If Docker is not answering

`./scripts/ux-stack.sh up` prints the fixes, but the WSL one is worth spelling
out because its error message misleads:

> The command 'docker' could not be found in this WSL 2 distro.

That is the **Windows shim** talking, and it means the daemon is unreachable
from Linux — not that Docker is missing. Two separate things to check:

1. **Is Docker Desktop running?** `"/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe" ps`
   answering `npipe:////./pipe/dockerDesktopLinuxEngine … cannot find the file`
   means the engine is stopped. Start it:
   ```bash
   powershell.exe -NoProfile -Command "Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'"
   ```
   Then wait — it takes 30–90 seconds before `docker ps` works.
2. **Is this distro integrated?** Docker Desktop → Settings → Resources → WSL
   Integration → enable this distro → Apply & Restart.

No Docker at all? Any Postgres 16 on `5441` works; export `DATABASE_URL` and run
the API and Vite steps from `ux-stack.sh` by hand.

---

## 2. Seed a world

```bash
node scripts/ux/seed-world.mjs
```

Idempotent — re-run it freely, including after a failure. It builds a league
with **two** seasons (one open, one draft), three teams each owned by a
different player, and a published tournament with registration open.

Those choices are deliberate. An empty database photographs as a row of empty
states and teaches you nothing, and each piece of the shape exposes something:
the second season is what reveals how the selector chooses; separate team owners
are required because **a player may captain only one team per season**.

---

## 3. Walk it

```bash
node scripts/ux/walk.mjs visitor     # signed out — the first impression
node scripts/ux/walk.mjs player      # signed in, no league, no team
node scripts/ux/walk.mjs captain     # owns a team, has to field it
node scripts/ux/walk.mjs organiser   # runs the competition
node scripts/ux/walk.mjs all

node scripts/ux/matchday.mjs         # check-in, map veto, result reporting
```

`matchday.mjs` is its own script rather than a journey in `walk.mjs`, because it
is the only walk that needs **two** browsers driven against each other. Almost
everything on match day is a negotiation — one side checks in and waits, one
bans and the other picks, one reports a score and the other agrees or does not —
and a screenshot of one side alone hides half of it. It builds a throwaway
tournament per run (`ux-matchday-<stamp>`) so repeated runs never fight over one
bracket, and its shots land in `scripts/ux/shots/matchday/`.

Three things it does deliberately, which you should preserve if you edit it:

- **Organiser plumbing goes through the API; every captain step is clicked.**
  Scheduling, opening the check-in window and moving a match into play are
  set-up. Checking in, banning a map and filling the score form are what is
  under review.
- **It creates the veto session at check-in-window-open, not later.** That is
  where the real lifecycle pass does it, and doing it later would flatter the
  product — see the match-day findings.
- **Failures log rather than being swallowed.** An early version wrapped the
  set-up calls in `.catch(() => {})` and spent a run photographing a match that
  had silently failed to start.

Screens land in `scripts/ux/shots/<journey>/`. Every journey uses a **fresh
account**, so you see what a new arrival sees rather than what your dev account
has accumulated.

Then open them. Not the filenames — the images. The findings above were sitting
in plain sight in a screenshot and were invisible in the source.

### Reading them

Useful questions, in rough order of how much trouble they catch:

- **Where am I?** Does the page name its league and its season? A roster is
  season-scoped; a page showing one without saying which is lying by omission.
- **What can I do next, and what happens if I do?** Is the primary action the
  most prominent one — or is a destructive action sitting beside it at equal
  weight?
- **When the app says no, does it say why?** A refusal with no reason and no
  route out is the most expensive thing in a funnel. Check whether *different*
  causes produce different messages: the first pass found a captain with a team
  and a newcomer with none getting identical wording.
- **Do two things that look the same behave the same?** Sections under one
  control that disagree about scope teach users the wrong model.
- **What does an empty state claim?** "No teams yet" is a statement of fact
  about a scope. Make sure it is the scope the user selected.
- **Compare the operator's view with the player's.** Where the admin screen
  shows state clearly and the public one doesn't, that gap is the finding.

---

## 4. Write it up

Findings are worth more when they carry their evidence. For each: what happens,
why it confuses, the smallest fix, and the `file:line` that causes it. Rank them
by damage — how many people hit it, and how hard it blocks — not by how easy
they are to fix.

Two things worth doing explicitly:

- **Verify the setup before you blame the product.** A screenshot only means
  what the underlying data says it means. The first pass published "a captain
  with a team in this season is refused" from a screen whose team was in a
  *different* season — the app was right and the seed was wrong. Before writing
  a finding, query the data behind it: which league, which season, which role.
- **Correct yourself in public.** That pass also claimed there were no
  breadcrumbs and that eligibility was hidden in a modal; the screenshots showed
  both were wrong. Publishing the corrections beside the findings is what makes
  the rest credible.
- **Say what you did not look at.** The first pass never covered match day; the
  match-day pass that followed never covered a phone viewport, forfeits and
  no-shows, or the organiser's side of a dispute. Naming the gap stops a reader
  assuming coverage you did not have.
- **Read the API behind the screen.** The strongest match-day finding — every
  standard veto format silently dropping its last action — was invisible in the
  browser. It surfaced only from `GET /v1/matches/{id}/veto` on a *finished*
  session, which still listed the decider as `available` with no game number.
  When a screen looks subtly wrong, fetch the object it is drawing.

The September 2026 write-up, for reference on depth and structure:
<https://claude.ai/code/artifact/aa445df9-817c-4a66-9432-b62ea34b3349>

---

## Traps that cost time

Each of these was hit on the first pass.

| Symptom | Cause |
| --- | --- |
| Every `page.goto` takes its full timeout | Vite keeps an HMR websocket open, so `networkidle` never fires. Use `domcontentloaded` plus a short wait — `walk.mjs` does. |
| `409 … is already a primary member of team … in this season` | One primary team per player per season. Give each team its own owner. |
| `409 Display name '…' is already taken` | Display names are unique. Randomise them; never hard-code. |
| `400 Unknown map: de_overpass` | Map ids are validated against the game's configured pool, which changes. Read `/v1/games/{id}/maps` instead of guessing. |
| Eligibility looks broken — "No Eligible Teams" for a captain who clearly qualifies | Check the entities are in the *same season*. `/v1/league-seasons` lists newest-created-first, so a re-run of a seed that picks `seasons[0]` silently attaches new objects to a different season. Pin seasons by slug. This produced a false finding on the first pass. |
| `409 league slug '…' is already taken` on a re-run | The seed is idempotent by design; if you extend it, look each entity up before creating it. |
| `cargo` fails with "error communicating with database" | `portal-db` has compile-time query macros. `SQLX_OFFLINE=true` on every cargo command when Postgres is not up. |
| Screens show a league you already joined | You reused an account. Every journey should mint a new one. |
| Map tiles photograph as black rectangles | Not a defect — the artwork is not preloaded and the shot caught it mid-load. Re-shoot before writing it up; this cost a false finding on the match-day pass. |
| A match jumps check-in → in progress with no veto | The tournament has no `default_map_veto_format`. Nothing at bracket generation sets `veto_required`; only creating a veto session does. |
| `400 Insufficient participants for tournament` on start | Tournament-level check-in is `POST /v1/tournaments/{id}/registrations/{regId}/admin-check-in` — a different thing from the match-level check-in, and a different path from the one under `/v1/admin/`. |
| A veto has auto-banned four maps and nobody touched it | Working as built. Turn timeout is 30s and the session starts when the check-in window opens, 15 minutes before kick-off. |
| `getByRole('button')` finds no ban/pick control | A map tile is a `v-card` with a click handler. Use `.map-card-selectable`, then `[data-testid="veto-confirm-action"]` for the second, committing tap. |
