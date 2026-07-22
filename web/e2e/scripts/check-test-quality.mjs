#!/usr/bin/env node
/**
 * E2E test-quality ratchet.  See ../COVERAGE-PLAN.md
 *
 * The suite carries a large backlog of tests that CANNOT FAIL — bodies wrapped
 * in `if (await x.isVisible().catch(() => false))` skip themselves precisely
 * when the frontend is broken, and still report green.  A hard ban would fail
 * on ~88 pre-existing sites, so this is a RATCHET instead:
 *
 *   - counts are baselined per file in .test-quality-baseline.json
 *   - CI fails if any count INCREASES, or a new file introduces a violation
 *   - counts may only go down; run with --update after fixing to lower them
 *
 * Usage:
 *   node e2e/scripts/check-test-quality.mjs            # check (CI)
 *   node e2e/scripts/check-test-quality.mjs --update   # re-baseline after fixes
 *
 * Escape hatch: put `coverage-plan-exempt: <reason>` in a comment on the line
 * to exclude it (for genuinely API-level checks, e.g. RBAC 403 assertions).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const E2E_DIR = join(HERE, '..')
const BASELINE = join(E2E_DIR, '.test-quality-baseline.json')
const EXEMPT = 'coverage-plan-exempt'

/** Patterns that make a test unable to fail. */
const RULES = {
  // `await x.isVisible().catch(() => false)` — "if it's missing, skip the test".
  visibilityGuard: {
    describe: 'visibility guard (test body skips itself when the UI is missing)',
    test: (line) => /isVisible\(\)\s*\.catch\(/.test(line),
  },
  // `expect(anything || true).toBe(true)` and friends — literally always passes.
  tautology: {
    describe: 'tautological assertion (always passes)',
    test: (line) => /expect\([^)]*\|\|\s*true\s*\)/.test(line) || /expect\(\s*true\s*\)\s*\.toBe\(\s*true\s*\)/.test(line),
  },
  // `expect(a || b).toBe(true)` — usually "real state OR its empty state".
  orAssertion: {
    describe: 'or-assertion (often a real state OR its empty state — cannot fail)',
    test: (line) => /expect\([^)]*\|\|[^)]*\)\s*\.toBe\(\s*true\s*\)/.test(line),
  },
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'scripts' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

// NOTE: a "test body with no expect()" rule was prototyped here and removed.
// Reliably delimiting a test body needs real parsing (template literals and
// regex literals defeat brace counting), and the approximation produced false
// positives on known-good specs. A guardrail that cries wolf gets ignored, so
// the automated gate keeps only exact line-level rules; the handful of genuine
// "no assertion" tests are tracked explicitly in COVERAGE-PLAN.md §5.3.

function scan() {
  const results = {}
  for (const file of walk(E2E_DIR).sort()) {
    const rel = relative(E2E_DIR, file).replace(/\\/g, '/')
    const source = readFileSync(file, 'utf8')
    const counts = {}
    for (const line of source.split('\n')) {
      if (line.includes(EXEMPT)) continue
      for (const [name, rule] of Object.entries(RULES)) {
        if (rule.test(line)) counts[name] = (counts[name] ?? 0) + 1
      }
    }
    if (Object.keys(counts).length > 0) results[rel] = counts
  }
  return results
}

const current = scan()
const update = process.argv.includes('--update')

if (update) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`)
  const total = Object.values(current).reduce(
    (sum, c) => sum + Object.values(c).reduce((a, b) => a + b, 0), 0)
  console.log(`Baseline updated: ${Object.keys(current).length} files, ${total} violations.`)
  process.exit(0)
}

let baseline = {}
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
} catch {
  console.error(`No baseline at ${BASELINE}. Create it with --update.`)
  process.exit(1)
}

const regressions = []
const improvements = []
for (const [file, counts] of Object.entries(current)) {
  for (const [rule, n] of Object.entries(counts)) {
    const was = baseline[file]?.[rule] ?? 0
    if (n > was) regressions.push({ file, rule, was, now: n })
  }
}
for (const [file, counts] of Object.entries(baseline)) {
  for (const [rule, was] of Object.entries(counts)) {
    const now = current[file]?.[rule] ?? 0
    if (now < was) improvements.push({ file, rule, was, now })
  }
}

for (const { file, rule, was, now } of improvements) {
  console.log(`improved  ${file} — ${rule}: ${was} → ${now}`)
}

if (regressions.length > 0) {
  console.error('\nE2E test-quality ratchet FAILED — these may only decrease:\n')
  for (const { file, rule, was, now } of regressions) {
    console.error(`  ${file}`)
    console.error(`    ${rule}: ${was} → ${now}  (${RULES[rule]?.describe ?? rule})`)
  }
  console.error('\nSee web/e2e/COVERAGE-PLAN.md §2-3. Drive the action through the UI')
  console.error('and build the precondition instead of guarding on it.')
  console.error(`If a line is a genuine API-level check, mark it: // ${EXEMPT}: <reason>\n`)
  process.exit(1)
}

if (improvements.length > 0) {
  console.log('\nViolations decreased — re-baseline with:')
  console.log('  npm run test:quality -- --update\n')
}
console.log('E2E test-quality ratchet passed.')
