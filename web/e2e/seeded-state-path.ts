/**
 * The single definition of where global-setup persists its seeded state.
 *
 * Why this is its own module: `global-setup.ts` writes the file and
 * `fixtures/seeded-state.ts` reads it, and they used to derive the path
 * independently. Two copies of a path is one copy too many — parallel agents
 * need it namespaced, and a namespacing that only half-applied would have the
 * reader looking for a file the writer never wrote.
 *
 * Parallel agents each run their own ephemeral stack
 * (`scripts/e2e-ephemeral.sh -i N`) against its own throwaway database, so the
 * state files must not collide. `E2E_INSTANCE` namespaces the file.
 *
 * Instance 0 keeps the historical `.seeded-state.json` name, so a plain
 * `npx playwright test` against the dev stack behaves exactly as before.
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// `__dirname` is undefined in ESM scope (package.json has "type": "module").
// This module lives in `e2e/`, so its own directory is the anchor.
const E2E_DIR = dirname(fileURLToPath(import.meta.url))

/** Instance id for this run; '0' (the default) is the un-namespaced instance. */
export const E2E_INSTANCE = process.env.E2E_INSTANCE || '0'

export const SEEDED_STATE_PATH = join(
  E2E_DIR,
  E2E_INSTANCE === '0' ? '.seeded-state.json' : `.seeded-state.${E2E_INSTANCE}.json`,
)
