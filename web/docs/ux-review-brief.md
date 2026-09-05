# Brief: an independent UX review

A prompt for a second pass over the Community Gaming portal, by someone who has
not seen the first one. Hand it over verbatim.

The point of a second reviewer is not confirmation. A second reviewer who ends
up agreeing with the first has told you nothing you did not already have. So
this brief is built to keep you from being led: you look, decide, and write
before you are allowed to read what anyone else concluded.

---

## The prompt

> You are reviewing the user experience of a competitive-gaming league and
> tournament platform — CS2 leagues, seasons, team rosters, brackets, and the
> match nights those produce. Its users are amateur players and the volunteers
> who organise for them, and it competes for their attention with FACEIT, ESEA,
> Battlefy, Toornament and start.gg. Real first-time users have reported that
> they found it confusing. Your job is to work out why, and to say what it
> should look like instead.
>
> A previous review of the same product exists, with screenshots, findings and
> a proposed redesign. **Do not open it until Phase 3.** It is at
> <https://claude.ai/code/artifact/aa445df9-817c-4a66-9432-b62ea34b3349>, and
> the value you add is precisely the part of your judgement that forms without
> it. `web/docs/ux-walkthroughs.md` is the method runbook and is safe to read
> now — it explains how to run everything and lists the traps — but skip its
> "For reference" links and the two examples in its opening section, which give
> away conclusions.
>
> ### Phase 1 — see it for yourself
>
> Bring the stack up and walk the product. `web/docs/ux-walkthroughs.md` has the
> full setup, including the Docker-on-WSL failure modes and a table of traps
> that each cost the first pass a wasted run. In short:
>
> ```bash
> cd web
> ./scripts/ux-stack.sh up          # postgres :5441, api :3007, vite :5180
> node scripts/ux/seed-world.mjs
> node scripts/ux/walk.mjs all      # visitor, player, captain, organiser
> node scripts/ux/matchday.mjs      # check-in, map veto, result reporting
> ```
>
> Screens land in `web/scripts/ux/shots/<journey>/` (gitignored — regenerate,
> don't hunt for old ones). Every journey mints a fresh account, so what you see
> is what a new arrival sees.
>
> Then **open the images**, all of them, before you open any source file. The
> whole reason this tooling exists is that reading the components tells you what
> the app does and only the screenshots tell you what the page *says*.
>
> Do not stop at the scripted paths. Click around the running app yourself —
> especially anywhere the scripts had to drive the API instead of the UI, since
> that is usually where a journey has no clickable route at all. The admin login
> is printed by `ux-stack.sh up`.
>
> ### Phase 2 — decide, and write it down
>
> Before reading any prior analysis, produce your own draft covering:
>
> 1. **What is actually wrong.** Ranked by damage — how many people hit it
>    multiplied by how hard it blocks them — not by how easy it is to fix. For
>    each: what happens, why it confuses or blocks, and the file:line that causes
>    it. Distinguish "this is broken" from "this is confusing"; they need
>    different fixes and different urgency.
> 2. **Your own information architecture.** Not a list of tweaks — a position on
>    how this product should be organised. What are the top-level places? What
>    is a page and what is a panel? Where does the concept of a *season* live,
>    given that rosters, standings and eligibility are all scoped to one? Left-nav
>    sub-menus are one option among several; propose whatever you actually think
>    is right, including "this navigation is fine, the problem is elsewhere".
> 3. **Redesigns of the three or four screens that carry the most weight.** Show
>    layout and copy, not adjectives. Write the actual words on the actual
>    buttons.
> 4. **A sequenced plan**, cheapest-high-value first, with a rough sense of what
>    each costs.
>
> Two rules of evidence, both learned the hard way on the first pass:
>
> - **Verify the setup before you blame the product.** A screenshot means only
>   what the data behind it says it means. The first pass published "a captain
>   with a team in this season is refused" from a screen whose team was in a
>   *different* season — the app was right and the seed was wrong. Query the
>   objects behind any screen you are about to call defective: which league,
>   which season, which role, which status.
> - **Read the API behind the screen.** Some of the worst problems here are
>   invisible in a browser and obvious in a JSON response. Fetch the object the
>   page is drawing.
>
> ### Phase 3 — reconcile
>
> Now read the prior report. Then add a section to your own write-up that is
> explicitly about the difference:
>
> - **Where you disagree**, and why yours is better. This is the most valuable
>   section in your deliverable; do not soften it.
> - **What it got wrong or overstated.** It ranks by funnel damage and has a
>   stated thesis; both are arguable. Check its file:line citations — a wrong
>   citation is a wrong finding.
> - **What it missed**, including anything it explicitly declined to cover.
> - **What you would cut from its recommendations.** A shorter plan that ships
>   is worth more than a longer one that does not, and some of its proposals will
>   be more redesign than the problem justifies.
>
> If, after genuinely trying, you conclude the prior report was right about
> something — say so plainly and move on. Manufactured disagreement is worse than
> agreement.
>
> ### Deliverable
>
> One report, published as an artifact, structured as: your findings, your IA and
> screen designs, your sequenced plan, then the reconciliation section. Carry the
> screenshots inline as evidence — a finding without its picture is an assertion.
> Be specific enough that an engineer could start on Monday without asking you a
> question.
>
> Name what you did not look at. The first pass never covered a phone viewport,
> forfeits and no-shows, or the organiser's side of a dispute; if you do not
> cover them either, say so rather than leaving a reader to assume coverage you
> did not have.

---

## Notes for whoever hands this over

- The stack is disposable. `./scripts/ux-stack.sh down` when finished; the seed
  is idempotent and safe to re-run after any failure.
- Every `cargo` command needs `SQLX_OFFLINE=true` unless Postgres is up.
- The screenshots are gitignored on purpose. Regenerating them is the point —
  it means the reviewer sees the product, not a curated selection of it.
- Phase 3 is not optional. A review that never engages with the prior one leaves
  you holding two documents and no decision.
