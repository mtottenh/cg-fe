/**
 * The internal (`X-API-Key`) half of the demo pipeline, for e2e use.
 *
 * P-143: everything upstream of the demo catalog speaks over
 * `routes/internal.rs`, which is key-authenticated service-to-service
 * plumbing — no browser identity can reach it, so no e2e test could drive an
 * enrichment FAILURE into the admin surfaces and their failure rendering was
 * API-covered only. The seeder now mints a well-known key
 * (`portal-cli/src/commands/seed/scenario.rs`, `SEED_INTERNAL_API_KEY`);
 * this constant is its pair, and the pair IS the contract — change one and
 * the other must follow.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export const SEED_INTERNAL_API_KEY = 'cgp_e2e_internal_dev_stack_key_00'

/**
 * Mark a demo's stats enrichment as failed, exactly as the enricher service
 * reports a parse failure.
 */
export async function markDemoStatsFailed(demoId: string, error: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/internal/demos/${demoId}/stats-failed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': SEED_INTERNAL_API_KEY,
    },
    body: JSON.stringify({ error }),
  })
  if (!resp.ok) {
    throw new Error(
      `Mark stats failed: ${resp.status} ${await resp.text()} — is the seeded ` +
        `internal API key present? (portal-cli seed mints it; P-143)`,
    )
  }
}
