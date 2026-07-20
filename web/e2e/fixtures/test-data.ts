/**
 * Test data constants for E2E tests.
 * These are used to create consistent test scenarios.
 */

// Generate unique identifiers for test isolation
export function uniqueId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function uniqueEmail(): string {
  return `test-${uniqueId()}@example.com`
}

export function uniqueUsername(): string {
  return `testuser_${uniqueId()}`
}

/**
 * CS2 competitive map pool, matching the game's seeded `default_map_pool`
 * (migration 0018). `map_pool` is REQUIRED on tournament creation, so every
 * fixture that creates a tournament must send one - import this rather than
 * hand-rolling a list, so a pool change lands in exactly one place.
 */
export const CS2_MAP_POOL = [
  'de_dust2',
  'de_mirage',
  'de_inferno',
  'de_nuke',
  'de_ancient',
  'de_anubis',
  'de_vertigo',
]

// Test user templates
export const testUsers = {
  // Standard test user - use unique credentials each run
  standard: () => ({
    username: uniqueUsername(),
    email: uniqueEmail(),
    password: 'TestPassword123!',
    display_name: 'Test Player',
  }),

  // Admin user - seeded by Docker entrypoint via portal-cli bootstrap
  // Credentials can be overridden via environment variables
  admin: {
    username_or_email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123!',
  },

  // Second test player — fixed credentials for multi-player E2E flows
  // Registered by global-setup.ts; used for match scheduling, result submission, invitations
  player2: {
    username: 'e2e_player2',
    email: 'e2e_player2@example.com',
    password: 'Player2Password123!',
    display_name: 'E2E Player 2',
  },

  // Login credentials for player2
  player2Login: {
    username_or_email: 'e2e_player2@example.com',
    password: 'Player2Password123!',
  },

  // Invalid credentials for negative tests
  invalid: {
    username_or_email: 'nonexistent@example.com',
    password: 'WrongPassword123!',
  },
}

// Tournament test data
// These should match what's seeded by global-setup.ts
export const testTournaments = {
  // Main test tournament (individual) - seeded by global-setup.ts
  // Falls back to existing tournament if seeding failed
  standard: {
    name: 'E2E Test Tournament',
    slug: 'e2e-test-tournament',
  },

  // Team-based tournament - seeded by global-setup.ts
  team: {
    name: 'E2E Team Tournament',
    slug: 'e2e-team-tournament',
  },

  // Fallback to manually created tournaments if they exist
  fallback: {
    name: 'test tourney',
    slug: 'test-tourney',
  },
}

// Team test data
export const testTeams = {
  standard: () => ({
    name: `Test Team ${uniqueId()}`,
    tag: uniqueId().substring(0, 4).toUpperCase(),
  }),
}

// League test data - seeded by global-setup.ts
export const testLeagues = {
  standard: {
    name: 'E2E Test League',
    slug: 'e2e-test-league',
  },
}

// Season test data - seeded by global-setup.ts
export const testSeasons = {
  standard: {
    name: 'E2E Test Season',
  },
}
