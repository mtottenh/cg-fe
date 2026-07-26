#!/usr/bin/env node
/**
 * Derive COVERAGE-PLAN.md's status line and Open list from the §5 register table.
 *
 * The register is the single source of truth (§5). The summary above it is a
 * projection of that table and must never be hand-edited — hand-maintaining it
 * has already gone wrong twice in this effort:
 *
 *   1. Register rows were appended to §4b's table instead of §5's, because both
 *      sections use the same `| P-NNN | ... |` row shape and the anchor matched
 *      the wrong one. The finding was "registered" somewhere nobody counts.
 *   2. The status line drifted from the table whenever a fix landed and only one
 *      of the two places was updated.
 *
 * Both are the same defect: a derived value maintained by hand. This computes it.
 *
 * Usage:
 *   node e2e/scripts/sync-register.mjs           # rewrite the summary in place
 *   node e2e/scripts/sync-register.mjs --check   # exit 1 if out of sync (CI gate)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAN = resolve(HERE, '../COVERAGE-PLAN.md')

const ROW = /^\|\s*(P-\d+)\s*\|(.*)\|\s*([^|]*?)\s*\|\s*$/
const REGISTER_HEADING = /^## 5\. /
const NEXT_HEADING = /^## /

/**
 * Slice out §5 only. Scanning the whole document would sweep in §4b's
 * deployment-gate table, which shares the row shape but is a *view* of the
 * register, not the register — counting both double-counts every blocker.
 */
function registerRows(lines) {
  const start = lines.findIndex((l) => REGISTER_HEADING.test(l))
  if (start === -1) throw new Error('§5 register heading not found in COVERAGE-PLAN.md')
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (NEXT_HEADING.test(lines[i])) {
      end = i
      break
    }
  }

  const rows = []
  const seen = new Map()
  for (let i = start; i < end; i++) {
    const m = ROW.exec(lines[i])
    if (!m) continue
    const [, id, , statusCell] = m
    // The status cell is the LAST column: "open", "**fixed** `sha`", "wontfix".
    const status = /\bfixed\b/i.test(statusCell)
      ? 'fixed'
      : /\bwontfix\b/i.test(statusCell)
        ? 'wontfix'
        : /\bopen\b/i.test(statusCell)
          ? 'open'
          : null
    if (status === null) {
      throw new Error(
        `${id} (line ${i + 1}): status cell "${statusCell}" is neither open, fixed, nor ` +
          `wontfix. A row whose status cannot be read would be silently dropped from ` +
          `the counts, which is exactly the drift this script exists to prevent.`,
      )
    }
    if (seen.has(id)) {
      throw new Error(
        `${id} appears twice in §5 (lines ${seen.get(id)} and ${i + 1}). Duplicate ` +
          `rows make the counts meaningless — one of them is a paste error.`,
      )
    }
    seen.set(id, i + 1)
    rows.push({ id, status, num: Number(id.slice(2)) })
  }
  if (rows.length < 50) {
    throw new Error(
      `only ${rows.length} register rows parsed — the table shape must have changed. ` +
        `Refusing to rewrite the summary from a partial read.`,
    )
  }
  return rows
}

const text = readFileSync(PLAN, 'utf8')
const lines = text.split('\n')
const rows = registerRows(lines)

const open = rows.filter((r) => r.status === 'open').sort((a, b) => a.num - b.num)
const fixed = rows.filter((r) => r.status === 'fixed')
const wontfix = rows.filter((r) => r.status === 'wontfix')

const statusLine =
  `**Status (derived): ${rows.length} found · ${fixed.length} fixed · ${open.length} open**` +
  (wontfix.length ? ` · ${wontfix.length} wontfix` : '') +
  ` (P-53 mitigated).`
const openLine = open.length
  ? `Open: ${open.map((r) => r.id).join(', ')}.`
  : `Open: none — the register is drained.`

const statusIdx = lines.findIndex((l) => l.startsWith('**Status (derived):'))
const openIdx = lines.findIndex((l) => l.startsWith('Open: '))
if (statusIdx === -1 || openIdx === -1) {
  console.error('Could not find the derived status/Open lines to rewrite.')
  process.exit(1)
}

const inSync = lines[statusIdx] === statusLine && lines[openIdx] === openLine

if (process.argv.includes('--check')) {
  if (inSync) {
    console.log(`register in sync: ${rows.length} found · ${fixed.length} fixed · ${open.length} open`)
    process.exit(0)
  }
  console.error('COVERAGE-PLAN.md summary is out of sync with the §5 register.\n')
  console.error(`  have: ${lines[statusIdx]}`)
  console.error(`  want: ${statusLine}\n`)
  console.error(`  have: ${lines[openIdx]}`)
  console.error(`  want: ${openLine}\n`)
  console.error('Run: node e2e/scripts/sync-register.mjs')
  process.exit(1)
}

lines[statusIdx] = statusLine
lines[openIdx] = openLine
writeFileSync(PLAN, lines.join('\n'))
console.log(inSync ? 'already in sync' : 'summary updated')
console.log(`  ${statusLine.replace(/\*\*/g, '')}`)
console.log(`  ${openLine}`)
