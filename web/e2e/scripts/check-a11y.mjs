#!/usr/bin/env node
/**
 * P-89/P-100 ratchet: interactive controls must say what they do.
 *
 * P-45 rotated the aria-labels on the RBAC role rows so "Manage" was wired to
 * Delete. It was point-fixed (`fbe1500`) and the class was never swept — so it
 * came back as P-89 on the games table, where the control announced as "Enable
 * game" called `handleDisableGame`. A screen-reader user activating "Enable"
 * disabled the game. That is a safety bug, not a cosmetic one, and it is on its
 * second occurrence, so it gets a guard rather than a third point fix.
 *
 *  1. **Label/handler agreement.** When an icon button carries both an
 *     `aria-label` and a literal `title`, they must not contradict each other.
 *     A mismatch is how both P-45 and P-89 presented.
 *
 *  2. **Named selects.** Vuetify renders no accessible name for `v-select`
 *     (P-100), so every one needs an explicit `aria-label`. Beyond a11y this is
 *     also why `getByLabel` could not reach any select — a trap that cost three
 *     separate agent lanes a cycle each.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(WEB, 'src')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== '__tests__') walk(full, out)
    } else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

const mismatches = []
const unnamedSelects = []

for (const file of walk(SRC)) {
  const rel = relative(WEB, file).split('\\').join('/')
  const txt = readFileSync(file, 'utf-8')

  for (const m of txt.matchAll(/<v-btn\b[^>]*?>/gs)) {
    const blk = m.group ?? m[0]
    const aria = /aria-label="([^"]+)"/.exec(blk)
    // Literal titles only. `(?<![:\w-])` excludes Vue's `:title="expr"` binding —
    // without it the regex matches the `title=` INSIDE `:title=` and reports a
    // dynamic expression as a contradiction.
    const title = /(?<![:\w-])title="([^"{]+)"/.exec(blk)
    if (!aria || !title) continue
    const a = aria[1].toLowerCase()
    const t = title[1].toLowerCase()
    // Agreement = one contains the other's leading word. Deliberately loose:
    // "Configure game" vs "Configure" agrees; "Enable game" vs "Disable" does not.
    if (!a.includes(t.split(' ')[0]) && !t.includes(a.split(' ')[0])) {
      mismatches.push(`${rel}:${txt.slice(0, m.index).split('\n').length}  aria-label="${aria[1]}" title="${title[1]}"`)
    }
  }

  for (const m of txt.matchAll(/<v-select\b[^>]*?>/gs)) {
    const blk = m[0]
    if (!blk.includes('aria-label')) {
      unnamedSelects.push(`${rel}:${txt.slice(0, m.index).split('\n').length}`)
    }
  }
}

let failed = false

if (mismatches.length) {
  failed = true
  console.error('\naria-label contradicts title (the P-45 / P-89 defect):')
  for (const m of mismatches) console.error(`  ${m}`)
  console.error('\nThe aria-label is the accessible name — it must describe what the')
  console.error('handler actually does, or a screen-reader user triggers the wrong action.')
}

if (unnamedSelects.length) {
  failed = true
  console.error(`\n${unnamedSelects.length} v-select(s) with no aria-label (P-100).`)
  console.error('Vuetify gives them no accessible name; mirror the visible `label`:')
  for (const s of unnamedSelects.slice(0, 20)) console.error(`  ${s}`)
}

if (failed) process.exit(1)
console.log('A11y ratchet passed. No aria-label/title contradictions; every v-select is named.')
