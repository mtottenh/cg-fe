#!/usr/bin/env node
/**
 * P-161 — unreachable API surface presented as product.
 *
 * `stores/evidence.ts` exported `validateDemo` and `fetchDemoStats`. Both wrapped
 * a real endpoint (`POST /v1/matches/{id}/evidence/validate-demo`,
 * `GET /v1/matches/{id}/evidence/demo-stats/{name}`), both had an action state,
 * both were returned from the store — and **nothing in `src/` ever called
 * either**. So two endpoints were unreachable from the product while looking, to
 * anyone reading the store, like wired features. That is worse than a gap: the
 * next person to need "check this demo" reaches for the nearest-named action and
 * gets the one that records no verdict (see the note above `validateEvidence`).
 *
 * The rule this enforces is narrow on purpose: an action that **issues an HTTP
 * request** and has **no caller outside its own store** is dead API surface. It
 * says nothing about pure helpers (`clear`, `$reset`, selectors) — those have
 * legitimate reasons to exist unused by components, and flagging them would turn
 * this into noise that gets suppressed.
 *
 * Scope: the demo/evidence pipeline stores. The pipeline is the evidence backbone
 * for dispute resolution, so a dead endpoint there is a dead limb of the product,
 * not a tidiness issue. Widening the list is welcome; do it by fixing the
 * findings, not by adding exceptions — there is deliberately no allow-list.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(WEB_ROOT, 'src')

/** Stores whose exported request-issuing actions must all be reachable. */
const GUARDED_STORES = ['stores/evidence.ts', 'stores/demos.ts']

function walk(dir, keep, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // A store action called only by its own unit test is exactly the bait
      // this exists to catch, so tests are not callers.
      if (entry.name === '__tests__') continue
      walk(p, keep, out)
    } else if (keep(entry.name)) {
      out.push(p)
    }
  }
  return out
}

/**
 * The names a `defineStore` setup function hands back.
 *
 * Reads the last top-level `return { ... }` block, which is the store's public
 * surface; entries are bare identifiers on their own line by convention here.
 */
function exportedNames(source) {
  const block = source.match(/^ {2}return \{([\s\S]*?)^ {2}\}\)?/m)
  if (!block) return []
  return [...block[1].matchAll(/^\s{4}([A-Za-z_$][\w$]*),/gm)].map((m) => m[1])
}

/**
 * The body of `function NAME(...)`, by brace matching.
 * Returns `null` when the name is not a function (state refs, computeds).
 *
 * The parameter list has to be skipped by paren matching first, not by jumping
 * to the next `{`: `validateDemoLink(matchId, claimed: { p1: number })` has an
 * object type in its signature, and taking that brace as the body start yields a
 * "body" containing no `api.` call — which silently exempts the action from this
 * check. That is the failure mode a dead-code detector must not have.
 */
function functionBody(source, name) {
  const decl = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*[(<]`).exec(source)
  if (!decl) return null

  const matchPair = (openChar, closeChar, from) => {
    let depth = 0
    for (let i = from; i < source.length; i++) {
      const c = source[i]
      // Skip string and template literals so a brace inside one cannot unbalance
      // the scan.
      if (c === "'" || c === '"' || c === '`') {
        const quote = c
        i++
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\') i++
          i++
        }
        continue
      }
      if (c === openChar) depth++
      else if (c === closeChar) {
        depth--
        if (depth === 0) return i
      }
    }
    return -1
  }

  let cursor = decl.index + decl[0].length - 1
  if (source[cursor] === '<') {
    const closeAngle = source.indexOf('>', cursor)
    if (closeAngle === -1) return null
    cursor = source.indexOf('(', closeAngle)
    if (cursor === -1) return null
  }
  const closeParen = matchPair('(', ')', cursor)
  if (closeParen === -1) return null

  const open = source.indexOf('{', closeParen)
  if (open === -1) return null
  const close = matchPair('{', '}', open)
  return close === -1 ? null : source.slice(open, close + 1)
}

/** Does this action reach the API client at all? */
function issuesRequest(body) {
  return /\bapi\.(GET|POST|PUT|PATCH|DELETE)\s*\(/.test(body)
}

const corpus = walk(SRC, (n) => n.endsWith('.ts') || n.endsWith('.vue')).map((f) => ({
  file: f,
  text: fs.readFileSync(f, 'utf8'),
}))

const failures = []
let checked = 0

for (const rel of GUARDED_STORES) {
  const storePath = path.join(SRC, rel)
  if (!fs.existsSync(storePath)) {
    failures.push(`${rel}: guarded store is missing — update GUARDED_STORES or restore the file`)
    continue
  }
  const source = fs.readFileSync(storePath, 'utf8')

  // Every function in the store, not only the exported ones: an action can be
  // reached because a *sibling* action calls it, and that is a real path as long
  // as the sibling is itself reachable.
  const bodies = new Map()
  for (const m of source.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]/g)) {
    const body = functionBody(source, m[1])
    if (body) bodies.set(m[1], body)
  }

  const reachable = new Set(
    [...bodies.keys()].filter((name) =>
      corpus.some(
        ({ file, text }) => file !== storePath && new RegExp(`\\b${name}\\s*\\(`).test(text),
      ),
    ),
  )
  // Transitive closure over intra-store calls. Without this the check would
  // punish exactly the right refactor — one action delegating to another rather
  // than copying its request — which is how `validateEvidence` earned its way
  // back into the product.
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, body] of bodies) {
      if (reachable.has(name)) continue
      for (const caller of reachable) {
        if (caller !== name && new RegExp(`\\b${name}\\s*\\(`).test(bodies.get(caller) ?? '')) {
          reachable.add(name)
          grew = true
          break
        }
      }
    }
  }

  for (const name of exportedNames(source)) {
    const body = bodies.get(name)
    if (!body || !issuesRequest(body)) continue
    checked++
    if (!reachable.has(name)) {
      failures.push(
        `${rel}: '${name}' issues an API request and nothing in src/ reaches it — ` +
          `either wire it to a surface, or delete it rather than leaving bait`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error('Dead store-action check FAILED:\n')
  for (const f of failures) console.error(`  - ${f}`)
  console.error(
    '\nAn exported store action that reaches an endpoint nothing calls is an ' +
      'endpoint the product cannot use, dressed as a feature (P-161).',
  )
  process.exit(1)
}

console.log(
  `Dead store-action check passed. ${checked} request-issuing actions across ` +
    `${GUARDED_STORES.length} pipeline stores, all reachable.`,
)
