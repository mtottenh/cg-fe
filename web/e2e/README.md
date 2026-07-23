# E2E tests

Playwright specs covering the SPA against a live API + database.

- **Working plan / coverage tracker:** [`COVERAGE-PLAN.md`](./COVERAGE-PLAN.md) — read this before changing tests.
- **Reference implementations:** `veto-flow`, `veto-realtime` (two-context), `tournament-seeding`, `tournament-lifecycle`, `uploads`, `evidence`.

## Running

```bash
npm run test:e2e              # needs a live stack (API :3000 + DB)
npm run test:e2e:ui           # interactive
npm run test:e2e:ephemeral    # self-contained stack on its own ports
npm run test:quality          # the "can this test even fail?" ratchet
```

## The rules that matter

A test earns its place only if it **can fail**. Concretely:

1. **Seed via API, act via UI, assert on UI *and* backend.** Using fixtures to build
   preconditions is encouraged. Performing *the action under test* through the API is not —
   that's how a real dispute bug shipped: no test ever clicked "Submit Dispute".
2. **Never guard the body.** This is banned:
   ```ts
   if (await x.isVisible().catch(() => false)) { …the whole test… }   // ❌ passes when broken
   ```
   If the precondition isn't guaranteed, **build it** (`createOpenRegistrationTournament`,
   `createTeamWithMembers`, …) instead of skipping around it.
3. **Own your state.** Don't hang state-sensitive tests off the globally seeded tournament —
   `global-setup` *starts* it, so registration/check-in controls never render.
4. **No assertions that can't fail:** `expect(a || true)`, `expect(realState || itsEmptyState)`,
   "the field I just typed into is non-empty", or asserting a page heading as a proxy for success.
5. **The test name is a contract.** If it says the user does X, the user must do X through the UI.

## The ratchet

`npm run test:quality` counts the patterns above per file against
`.test-quality-baseline.json`. **Counts may only go down.** CI fails if any increases.

After fixing a file, lower the baseline:

```bash
npm run test:quality -- --update
```

Genuinely API-level checks (e.g. asserting a 403 for RBAC) are legitimate — mark the line:

```ts
// coverage-plan-exempt: RBAC 403 is an API contract, no UI surface exists
```

## Verification commands (use these exact ones)

| Purpose | Command |
|---|---|
| Type check | `npm run typecheck` |
| Test-quality ratchet | `npm run test:quality` |
| E2E | `npx playwright test e2e/<spec>` |

⚠️ **Do NOT use `npx vue-tsc --noEmit -p tsconfig.json`.** `tsconfig.json` is a
solution-style config (`"files": []`, project references only), so that invocation
type-checks **zero files and always exits 0**. It was used as a verification gate across a
whole phase of the coverage campaign before anyone noticed, and it had already masked a real
error. CI has always used the correct `-p tsconfig.app.json` form — the defect was only in
commands run by hand.

**Prove a gate can fail before you trust it.** Feed it a known-bad input and confirm it
reports the failure. A gate that cannot fail is worse than no gate: it launders unverified
work as verified. See `COVERAGE-PLAN.md` §4a.

**The ratchet baseline is `{}` — zero violations.** Any reintroduced
`isVisible().catch()` guard, tautology, or `||` inside an assertion fails immediately. If you
have a genuinely legitimate exception, mark it `// coverage-plan-exempt: <reason>` so it is
visible rather than hidden.
