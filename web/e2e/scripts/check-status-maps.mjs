#!/usr/bin/env node
/**
 * P-112 ratchet: the raw-enum leak must not grow.
 *
 * This defect class has shipped as P-4, P-10, P-21, P-44, P-76, P-91 and P-96 —
 * each one a component rendering a wire value straight at a user ("Categorized
 * as scrim", "maintenance", "urgent priority"). Every one was point-fixed, and
 * it came back every time. So: a ratchet, in the same shape as
 * `check-test-quality.mjs`, which took the vacuous-guard class from 112 to 0.
 *
 * Two checks:
 *
 *  1. **Raw renders.** A template interpolating `x.status` / `.priority` /
 *     `.category` / `.override_type` / `.access_type` directly rather than
 *     through `getStatusLabel(map, …)`. BASELINE below is the set that existed
 *     when the ratchet was introduced; it may shrink, never grow.
 *
 *  2. **Unlockable maps.** Every map whose enum the API actually declares is
 *     typed `StatusMap<Union>`, so drift is a COMPILE error. The rest cannot be
 *     locked until the API stops stringifying those enums. That count may fall,
 *     never rise.
 *
 * Keying the twelve lockable maps immediately exposed five drifts nobody had
 * filed — including `teamStatusMap` missing five `LeagueTeamSeasonStatus`
 * values, a live leak. That is why this is structural and not another point fix.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(WEB, 'src')

/**
 * Known raw renders at the time the ratchet was introduced.
 *
 * Each is a real leak awaiting either a status map or an API enum declaration
 * (P-112). Delete entries as they are fixed — the ratchet fails if the list
 * grows, and also fails if an entry here no longer leaks, so it cannot go stale.
 */
// Keyed by `file#property#count`, NOT by line number. A line-based baseline is
// invalidated by any edit above an entry — adding aria-labels for P-100 shifted
// these and made the ratchet report pre-existing leaks as new. The key has to be
// stable under unrelated edits or the guard cries wolf and gets disabled.
const BASELINE = {
  // 8 -> 2. Fix-wave A cleared the league surfaces (Lane E) and the team page
  // (Lane D). The two left are blocked on P-112: `award.status` and
  // `registration.status` have no declared enum to map against.
  'src/components/admin/RegistrationReasonModal.vue#status': 1,
  'src/components/admin/tournament-detail/AwardsTab.vue#status': 1,
}

/** Genuinely not an enum — nothing to map. */
const EXEMPT = [
  // permission `priority` is a NUMBER.
  'src/pages/admin/AdminPermissionsPage.vue',
]

const RAW = /\{\{\s*[\w.]+\.(status|priority|category|override_type|access_type)\s*\}\}/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== '__tests__') walk(full, out)
    } else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

const found = {}
for (const file of walk(SRC)) {
  const rel = relative(WEB, file).split('\\').join('/')
  if (EXEMPT.some((e) => rel === e)) continue
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    // Skip comments. `check-test-quality.mjs` already does this and this one did
    // not, so a comment DOCUMENTING the raw-render defect was counted AS the
    // defect — it cost a lane a cycle. A guard that flags prose teaches people
    // to distrust it.
    const code = line.trimStart()
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('<!--')) continue
    const m = RAW.exec(line)
    if (!m) continue
    const key = `${rel}#${m[1]}`
    found[key] = (found[key] ?? 0) + 1
  }
}

const added = []
const fixed = []
for (const [key, count] of Object.entries(found)) {
  const allowed = BASELINE[key] ?? 0
  if (count > allowed) added.push(`${key} (${count}, baseline ${allowed})`)
}
for (const [key, allowed] of Object.entries(BASELINE)) {
  const count = found[key] ?? 0
  if (count < allowed) fixed.push(`${key} (now ${count}, baseline ${allowed})`)
}

let failed = false

if (added.length) {
  failed = true
  console.error('\nNEW raw-enum renders (P-112). Map these through getStatusLabel(map, …):')
  for (const a of added) console.error(`  ${a}`)
}

if (fixed.length) {
  failed = true
  console.error('\nThese BASELINE entries no longer leak — remove them from BASELINE so the')
  console.error('ratchet keeps its teeth:')
  for (const f of fixed) console.error(`  ${f}`)
}

// Map lockability.
const maps = readFileSync(join(SRC, 'utils', 'statusMaps.ts'), 'utf-8')
const total = (maps.match(/^export const \w+Map: StatusMap/gm) ?? []).length
const keyed = (maps.match(/^export const \w+Map: StatusMap</gm) ?? []).length
const unlocked = total - keyed
const MAX_UNLOCKED = 10

if (unlocked > MAX_UNLOCKED) {
  failed = true
  console.error(
    `\n${unlocked} status maps are unkeyed (max ${MAX_UNLOCKED}). A map without a union` +
      ' can drift the way P-79 and P-91 did. Key it, or declare the enum in the API (P-112).',
  )
}

if (failed) process.exit(1)

console.log(
  `Status-map ratchet passed. ${keyed}/${total} maps compile-locked, ` +
    `${Object.values(BASELINE).reduce((a, b) => a + b, 0)} known raw renders remaining.`,
)
