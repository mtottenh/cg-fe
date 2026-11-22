/**
 * Client-side mirror of the portal's MatchZy override rules
 * (`portal_core::matchzy_overrides`, which in turn mirrors the agent's
 * `validate_overrides`). It is here for fast feedback only: the API applies
 * the same rules and its `detail` is always what the admin sees on a 400.
 *
 * Rules (design doc §5.2, API `SetMatchzyOverridesRequest`):
 *  - at most 64 entries;
 *  - names match `^matchzy_[a-z0-9_]+$`, at most 128 characters, and are
 *    not portal-owned (`matchzy_demo_upload_*`, `matchzy_remote_*`,
 *    `matchzy_loadmatch*`, `matchzy_loadbackup_url`);
 *  - values (strings trimmed of spaces) render to at most 256 characters of
 *    printable ASCII without `"`, `;` or `\`.
 */

export const MAX_OVERRIDES = 64
export const MAX_OVERRIDE_NAME_LENGTH = 128
export const MAX_OVERRIDE_VALUE_LENGTH = 256

export type OverrideValue = string | number | boolean

/** One editable row of the overrides table. */
export interface OverrideRow {
  name: string
  value: string
}

const NAME_RE = /^matchzy_[a-z0-9_]+$/
// Printable ASCII (0x20–0x7e) minus `"`, `;` and `\`.
const VALUE_RE = /^[\x20-\x21\x23-\x3a\x3c-\x5b\x5d-\x7e]*$/

/** Why a cvar name is refused, or null when it is acceptable. */
export function overrideNameError(name: string): string | null {
  if (!name) return 'Name is required'
  if (name.length > MAX_OVERRIDE_NAME_LENGTH) {
    return `Name is longer than ${MAX_OVERRIDE_NAME_LENGTH} characters`
  }
  if (!NAME_RE.test(name)) {
    return 'Name must start with matchzy_ and use only a–z, 0–9 and _'
  }
  if (
    name.startsWith('matchzy_demo_upload_') ||
    name.startsWith('matchzy_remote_') ||
    name.startsWith('matchzy_loadmatch') ||
    name === 'matchzy_loadbackup_url'
  ) {
    return 'This setting is managed by the portal'
  }
  return null
}

/** The text the agent would write for a value (strings trimmed of spaces). */
export function renderOverrideValue(value: OverrideValue): string {
  if (typeof value === 'string') return value.replace(/^ +| +$/g, '')
  return String(value)
}

/** Why a value is refused, or null when it is acceptable. */
export function overrideValueError(value: OverrideValue): string | null {
  const text = renderOverrideValue(value)
  if (text.length > MAX_OVERRIDE_VALUE_LENGTH) {
    return `Value is longer than ${MAX_OVERRIDE_VALUE_LENGTH} characters`
  }
  if (!VALUE_RE.test(text)) {
    return 'Value must be printable ASCII without quotes, semicolons or backslashes'
  }
  return null
}

/** Per-row problems plus any whole-set problem. */
export interface OverridesValidation {
  valid: boolean
  /** Indexed like the rows; null where the row is fine. */
  rows: Array<{ name: string | null; value: string | null }>
  /** A problem with the set as a whole (too many entries). */
  set: string | null
}

/** Validate the editor's rows the way the API will. */
export function validateOverrideRows(rows: OverrideRow[]): OverridesValidation {
  const seen = new Map<string, number>()
  const result = rows.map((row, i) => {
    const name = row.name.trim()
    let nameError = overrideNameError(name)
    if (!nameError) {
      const first = seen.get(name)
      if (first !== undefined) nameError = `Duplicate of row ${first + 1}`
      else seen.set(name, i)
    }
    return { name: nameError, value: overrideValueError(row.value) }
  })
  const set =
    rows.length > MAX_OVERRIDES ? `At most ${MAX_OVERRIDES} overrides (${rows.length} given)` : null
  return {
    valid: set === null && result.every((r) => r.name === null && r.value === null),
    rows: result,
    set,
  }
}

/**
 * The stored map as editor rows, sorted by name. Values are shown as the
 * text the agent writes, so a boolean reads `true` and a number `3`.
 */
export function overridesToRows(overrides: Record<string, unknown>): OverrideRow[] {
  return Object.keys(overrides)
    .sort()
    .map((name) => {
      const v = overrides[name]
      const value =
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          ? renderOverrideValue(v)
          : ''
      return { name, value }
    })
}

/**
 * Rows back to the map the API takes. Values stay strings: the agent
 * renders them to the same text, and a string keeps `0.50` as typed.
 */
export function rowsToOverrides(rows: OverrideRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) out[row.name.trim()] = renderOverrideValue(row.value)
  return out
}
