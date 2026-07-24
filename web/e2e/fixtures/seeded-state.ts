/**
 * Load the seeded state written by global-setup.ts.
 * Provides tournament IDs, match IDs, and player tokens to test specs.
 */
import { readFileSync, existsSync } from 'fs'
import type { SeededState } from '../global-setup'
import { E2E_INSTANCE, SEEDED_STATE_PATH } from '../seeded-state-path'

let _state: SeededState | null = null

export function getSeededState(): SeededState {
  if (_state) return _state

  if (!existsSync(SEEDED_STATE_PATH)) {
    throw new Error(
      `Seeded state file not found at ${SEEDED_STATE_PATH} (E2E_INSTANCE=${E2E_INSTANCE}). ` +
      'Did global-setup.ts run successfully? If you are running a parallel ' +
      'instance, the runner and the tests must agree on E2E_INSTANCE — ' +
      'launch via `./scripts/e2e-ephemeral.sh -i <N>`, which exports it for both.'
    )
  }

  _state = JSON.parse(readFileSync(SEEDED_STATE_PATH, 'utf-8'))
  return _state!
}
