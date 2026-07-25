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

// `format` added and a trailing `|| 'fallback'` tolerated: the original regex
// missed `{{ stage.format || 'Default' }}` on BOTH counts, so an entire enum
// family was invisible to the guard. A guard is only as wide as its pattern —
// widen it whenever a leak is found outside it.
const RAW =
  /\{\{\s*[\w.]+\.(status|priority|category|format|override_type|access_type)\s*(\|\|[^}]*)?\}\}/

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
// 11 after `stageFormatMap` (P-117), then 5 once P-112 was worked: typing six DTO
// fields that stood in front of enums which already derived `Serialize` +
// `ToSchema` unlocked `disputePriorityMap`, `demoCategoryMap`, `banTypeMap`,
// `stageFormatMap`, `teamRoleMap` — and `tournamentPublicStatusMap`, which needed
// no API change whatsoever and had simply never been converted.
//
// This number is a DEBT METER, not a target: every unkeyed map is one that can
// still drift the way P-79 and P-91 did. It rises only when a new map is added for
// an enum the API has not declared, and must fall as P-112 is worked through.
//
// The 5 that remain are NOT all the same kind of debt, and the distinction matters
// before anyone tries to drive this to 0:
//   - `leagueAccessTypeMap`, `leagueRoleMap` — the enums exist and are spec-ready;
//     only `dto/responses/league.rs` still stringifies them. Two one-line fixes.
//   - `gameStatusMap` — no Rust enum exists. The DB CHECK constraint names the
//     five legal values, so an enum is transcribable, but nobody has written it.
//   - `permissionCategoryMap` — free-text column, no constraint. Nothing to key.
//   - `banStatusMap` — not a wire field at all; the key is derived client-side.
// So the floor reachable without new product decisions is 3, not 0.
const MAX_UNLOCKED = 5

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
