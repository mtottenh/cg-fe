/**
 * Load the seeded state written by global-setup.ts.
 * Provides tournament IDs, match IDs, and player tokens to test specs.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SeededState } from '../global-setup'

const SEEDED_STATE_PATH = join(__dirname, '..', '.seeded-state.json')

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
