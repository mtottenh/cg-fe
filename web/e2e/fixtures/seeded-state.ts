/**
 * Load the seeded state written by global-setup.ts.
 * Provides tournament IDs, match IDs, and player tokens to test specs.
 */
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { SeededState } from '../global-setup'

// The e2e harness runs as `"type": "module"` (see package.json), so
// `__dirname` isn't defined. Resolve the fixture directory from the
// module URL instead.
const THIS_DIR = dirname(fileURLToPath(import.meta.url))
const SEEDED_STATE_PATH = join(THIS_DIR, '..', '.seeded-state.json')

let _state: SeededState | null = null

export function getSeededState(): SeededState {
  if (_state) return _state

  if (!existsSync(SEEDED_STATE_PATH)) {
    throw new Error(
      `Seeded state file not found at ${SEEDED_STATE_PATH}. ` +
      'Did global-setup.ts run successfully?'
    )
  }

  _state = JSON.parse(readFileSync(SEEDED_STATE_PATH, 'utf-8'))
  return _state!
}
