/**
 * Global setup for E2E tests.
 * Seeds the database with test data before tests run.
 * Uses real admin authentication instead of dev-token.
 */

import { testUsers } from './fixtures/test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface Tournament {
  id: string
  slug: string
  name: string
}

interface League {
  id: string
  slug: string
  name: string
}

interface Season {
  id: string
  name: string
  status: string
}

interface Game {
  id: string
  name: string
}

/**
 * Get a real JWT token for the admin user via API call.
 */
async function getAdminToken(): Promise<string> {
  const response = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUsers.admin),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Admin login failed (${response.status}): ${errorText}`)
  }
  const data = await response.json()
  return data.data.access_token
}

async function seedTournaments(token: string): Promise<void> {
  console.log('Seeding test tournaments...')

  // Try to fetch the tournament directly by slug first
  const checkResponse = await fetch(`${API_URL}/v1/tournaments/slug/e2e-test-tournament`)
  if (checkResponse.ok) {
    console.log('Test tournament already exists, skipping seed')
    return
  }

  // Also check via list query as fallback
  const existingResponse = await fetch(`${API_URL}/v1/tournaments`)
  const existing = await existingResponse.json()

  if (existing.data?.some((t: Tournament) => t.slug === 'e2e-test-tournament')) {
    console.log('Test tournament already exists (found in list), skipping seed')
    return
  }

  // Get available games first
  const gamesResponse = await fetch(`${API_URL}/v1/games`)
  const gamesData = await gamesResponse.json()
  const games = gamesData.data || []

  if (games.length === 0) {
    throw new Error('No games found in database. Seed games before running tests.')
  }

  const gameId = games[0].id
  console.log(`Using game: ${games[0].name} (${gameId})`)

  // Create test tournament with open registration
  // Using POST /v1/tournaments endpoint
  const tournamentData = {
    name: 'E2E Test Tournament',
    slug: 'e2e-test-tournament',
    game_id: gameId,
    format: 'single_elimination',
    participant_type: 'individual',
    min_participants: 2,
    max_participants: 16,
    description: 'Tournament created for E2E testing',
  }

  console.log('Creating tournament with data:', JSON.stringify(tournamentData, null, 2))

  const createResponse = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(tournamentData),
  })

  // Handle 409 Conflict - tournament already exists (race condition)
  if (createResponse.status === 409) {
    console.log('Test tournament already exists (409 Conflict), continuing with setup')
    // Try to get the existing tournament ID for further setup
    const refetchResponse = await fetch(`${API_URL}/v1/tournaments/slug/e2e-test-tournament`)
    if (refetchResponse.ok) {
      const existingTournament = await refetchResponse.json()
      const tournamentId = existingTournament.data?.id || existingTournament.id
      if (tournamentId) {
        await ensureTournamentReady(token, tournamentId)
      }
    }
    return
  }

  if (!createResponse.ok) {
    const error = await createResponse.text()
    throw new Error(`Failed to create test tournament (${createResponse.status}): ${error}`)
  }

  const tournament = await createResponse.json()
  console.log(`Created test tournament: ${tournament.data?.slug || tournament.slug}`)

  // Get the tournament ID
  const tournamentId = tournament.data?.id || tournament.id
  if (!tournamentId) {
    console.error('No tournament ID in response:', tournament)
    return
  }

  await ensureTournamentReady(token, tournamentId)
  console.log('Test tournament setup complete')
}

/**
 * Ensure tournament is published and has registration open.
 * Called both for newly created tournaments and existing ones.
 */
async function ensureTournamentReady(token: string, tournamentId: string): Promise<void> {
  // Try to publish the tournament (if in draft status)
  const publishResponse = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (publishResponse.ok) {
    console.log('Tournament published')
  } else {
    console.log('Could not publish tournament (may already be published)')
  }

  // Try to open registration
  const openRegResponse = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/open-registration`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (openRegResponse.ok) {
    console.log('Registration opened')
  } else {
    console.log('Could not open registration (may already be open)')
  }
}

interface PlayerLeagueTeamMembership {
  team_id: string
  team_name: string
  team_tag: string
  season_id: string
  league_id: string
}

async function seedLeagueAndSeason(token: string): Promise<{ leagueId: string | null; seasonId: string | null }> {
  console.log('Seeding test league and season...')

  // Get available games first
  const gamesResponse = await fetch(`${API_URL}/v1/games`)
  const gamesData = await gamesResponse.json()
  const games: Game[] = gamesData.data || []

  if (games.length === 0) {
    throw new Error('No games found in database for league. Seed games before running tests.')
  }

  const gameId = games[0].id
  console.log(`Using game for league: ${games[0].name} (${gameId})`)

  // Check if test league already exists
  const leaguesResponse = await fetch(`${API_URL}/v1/leagues`)
  const leaguesData = await leaguesResponse.json()
  const leagues: League[] = leaguesData.data || []

  let leagueId: string | null = null
  const existingLeague = leagues.find((l) => l.slug === 'e2e-test-league')

  if (existingLeague) {
    console.log('Test league already exists, using existing')
    leagueId = existingLeague.id
  } else {
    // Create test league
    const leagueData = {
      name: 'E2E Test League',
      slug: 'e2e-test-league',
      game_id: gameId,
      description: 'League created for E2E testing',
    }

    console.log('Creating league...')
    const createLeagueResponse = await fetch(`${API_URL}/v1/leagues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(leagueData),
    })

    if (!createLeagueResponse.ok) {
      const error = await createLeagueResponse.text()
      throw new Error(`Failed to create test league (${createLeagueResponse.status}): ${error}`)
    }

    const league = await createLeagueResponse.json()
    leagueId = league.data?.id || league.id
    console.log(`Created test league: ${league.data?.slug || league.slug}`)
  }

  if (!leagueId) {
    throw new Error('No league ID available after creation. Seeding failed.')
  }

  // Check if season already exists for this league
  // NOTE: Seasons are at /v1/league-seasons, not nested under /leagues
  const seasonsResponse = await fetch(`${API_URL}/v1/league-seasons?league_id=${leagueId}`)
  let seasons: Season[] = []
  let seasonId: string | null = null
  if (seasonsResponse.ok) {
    const text = await seasonsResponse.text()
    if (text && text.length > 0) {
      try {
        const seasonsData = JSON.parse(text)
        seasons = seasonsData.data || []
      } catch {
        console.warn('Failed to parse seasons response')
      }
    }
  }

  const existingSeason = seasons.find((s) => s.name === 'E2E Test Season')

  if (existingSeason) {
    console.log('Test season already exists')
    seasonId = existingSeason.id

    // Ensure season is in registration status for team creation
    if (existingSeason.status === 'draft') {
      await openSeasonRegistration(token, seasonId)
    } else if (existingSeason.status !== 'registration') {
      console.warn(`Season is in '${existingSeason.status}' status - team creation may fail`)
    }
    return { leagueId, seasonId }
  }

  // Create a season for the league
  // NOTE: POST to /v1/league-seasons with league_id in body
  const seasonData = {
    league_id: leagueId,
    name: 'E2E Test Season',
    slug: 'e2e-test-season',
  }

  console.log('Creating season...')
  const createSeasonResponse = await fetch(`${API_URL}/v1/league-seasons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(seasonData),
  })

  if (!createSeasonResponse.ok) {
    const error = await createSeasonResponse.text()
    throw new Error(`Failed to create test season (${createSeasonResponse.status}): ${error}`)
  }

  const season = await createSeasonResponse.json()
  seasonId = season.data?.id || season.id
  console.log(`Created test season: ${season.data?.name || season.name}`)

  // Open registration on the season (changes status from draft to registration)
  await openSeasonRegistration(token, seasonId)

  console.log('Test league and season setup complete')
  return { leagueId, seasonId }
}

async function openSeasonRegistration(token: string, seasonId: string): Promise<void> {
  console.log('Opening season registration...')
  // NOTE: Season update is at /v1/league-seasons/{season_id}
  // Change status from draft to registration so teams can register
  const response = await fetch(`${API_URL}/v1/league-seasons/${seasonId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: 'registration' }),
  })

  if (response.ok) {
    console.log('Season registration opened')
  } else {
    const error = await response.text()
    console.error(`Could not open season registration: ${error}`)
  }
}

async function activateSeason(token: string, _leagueId: string, seasonId: string): Promise<void> {
  console.log('Activating season...')
  // NOTE: Season update is at /v1/league-seasons/{season_id}
  const response = await fetch(`${API_URL}/v1/league-seasons/${seasonId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: 'active' }),
  })

  if (response.ok) {
    console.log('Season activated')
  } else {
    console.log('Could not activate season (may already be active)')
  }
}

async function seedTeamForAdmin(token: string, _leagueId: string, seasonId: string): Promise<string | null> {
  console.log('Seeding test team for admin user...')

  // Check if admin already has a team
  // NOTE: My teams endpoint is at /v1/players/me/league-teams
  const myTeamsResponse = await fetch(`${API_URL}/v1/players/me/league-teams`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (myTeamsResponse.ok) {
    const myTeamsData = await myTeamsResponse.json()
    const myTeams: PlayerLeagueTeamMembership[] = myTeamsData.data || []
    if (myTeams.length > 0) {
      console.log('Admin already has a team, using existing')
      return myTeams[0].team_id
    }
  }

  // Create a team for the admin user
  // NOTE: Team creation is at /v1/league-seasons/{season_id}/teams
  const teamData = {
    name: 'E2E Admin Team',
    tag: 'E2EA',
    description: 'Team created for E2E testing',
  }

  console.log('Creating team for admin...')
  const createTeamResponse = await fetch(`${API_URL}/v1/league-seasons/${seasonId}/teams`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(teamData),
  })

  if (!createTeamResponse.ok) {
    const error = await createTeamResponse.text()
    throw new Error(`Failed to create test team (${createTeamResponse.status}): ${error}`)
  }

  const teamResponse = await createTeamResponse.json()
  // Response is { data: { team: { id, name, ... }, team_season: { ... } } }
  const createdTeam = teamResponse.data?.team || teamResponse.data || teamResponse
  const teamId = createdTeam?.id
  console.log(`Created test team: ${createdTeam?.name} (${teamId})`)
  return teamId
}

async function seedTeamTournament(token: string, leagueId: string, teamId: string): Promise<void> {
  console.log('Seeding team-based tournament...')

  // Try to fetch the team tournament directly by slug first
  const checkResponse = await fetch(`${API_URL}/v1/tournaments/slug/e2e-team-tournament`)
  if (checkResponse.ok) {
    const existingTournament = await checkResponse.json()
    const tournamentId = existingTournament.data?.id || existingTournament.id
    console.log('Team tournament already exists, ensuring team is registered')
    if (tournamentId) {
      await ensureTeamRegistered(token, tournamentId, teamId)
    }
    return
  }

  // Also check via list query as fallback
  const existingResponse = await fetch(`${API_URL}/v1/tournaments`)
  const existing = await existingResponse.json()

  if (existing.data?.some((t: Tournament) => t.slug === 'e2e-team-tournament')) {
    console.log('Team tournament already exists (found in list), skipping seed')
    return
  }

  // Get available games first
  const gamesResponse = await fetch(`${API_URL}/v1/games`)
  const gamesData = await gamesResponse.json()
  const games = gamesData.data || []

  if (games.length === 0) {
    throw new Error('No games found for team tournament. Seed games before running tests.')
  }

  const gameId = games[0].id

  // Create team-based tournament
  const tournamentData = {
    name: 'E2E Team Tournament',
    slug: 'e2e-team-tournament',
    game_id: gameId,
    format: 'single_elimination',
    participant_type: 'team',
    min_participants: 2,
    max_participants: 8,
    min_team_size: 1,
    max_team_size: 5,
    league_id: leagueId,
    description: 'Team-based tournament for E2E testing',
  }

  console.log('Creating team tournament...')
  const createResponse = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(tournamentData),
  })

  // Handle 409 Conflict - tournament already exists (race condition)
  if (createResponse.status === 409) {
    console.log('Team tournament already exists (409 Conflict), continuing with setup')
    const refetchResponse = await fetch(`${API_URL}/v1/tournaments/slug/e2e-team-tournament`)
    if (refetchResponse.ok) {
      const existingTournament = await refetchResponse.json()
      const tournamentId = existingTournament.data?.id || existingTournament.id
      if (tournamentId) {
        await ensureTournamentReady(token, tournamentId)
        await ensureTeamRegistered(token, tournamentId, teamId)
      }
    }
    return
  }

  if (!createResponse.ok) {
    const error = await createResponse.text()
    throw new Error(`Failed to create team tournament (${createResponse.status}): ${error}`)
  }

  const tournament = await createResponse.json()
  const tournamentId = tournament.data?.id || tournament.id
  console.log(`Created team tournament: ${tournament.data?.slug || tournament.slug}`)

  await ensureTournamentReady(token, tournamentId)
  await ensureTeamRegistered(token, tournamentId, teamId)
  console.log('Team tournament setup complete')
}

/**
 * Ensure team is registered for the tournament.
 * Handles case where team is already registered.
 */
async function ensureTeamRegistered(token: string, tournamentId: string, teamId: string): Promise<void> {
  const registerResponse = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/registrations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ team_id: teamId }),
  })

  if (registerResponse.ok) {
    console.log('Team registered for tournament')
  } else if (registerResponse.status === 409) {
    console.log('Team already registered for tournament')
  } else {
    const error = await registerResponse.text()
    console.log(`Could not register team for tournament: ${error}`)
  }
}

async function globalSetup(): Promise<void> {
  console.log('\n========================================')
  console.log('E2E Global Setup - Seeding Test Data')
  console.log('========================================\n')

  try {
    // Check if API is available
    const healthResponse = await fetch(`${API_URL}/health`)
    if (!healthResponse.ok) {
      throw new Error('API is not responding')
    }
    console.log('API is healthy')

    // Get real admin JWT token
    console.log('Authenticating as admin...')
    const adminToken = await getAdminToken()
    console.log('Admin authentication successful')

    // Seed tournaments with real auth
    await seedTournaments(adminToken)

    // Seed league and season for team management tests
    const { leagueId, seasonId } = await seedLeagueAndSeason(adminToken)

    // Create a team for the admin user (for profile and team tests)
    let teamId: string | null = null
    if (leagueId && seasonId) {
      teamId = await seedTeamForAdmin(adminToken, leagueId, seasonId)
    }

    // Seed team-based tournament
    if (leagueId && teamId) {
      await seedTeamTournament(adminToken, leagueId, teamId)
    }

    console.log('\n========================================')
    console.log('Global Setup Complete')
    console.log('========================================\n')
  } catch (error) {
    console.error('\n========================================')
    console.error('GLOBAL SETUP FAILED - TEST DATA NOT SEEDED')
    console.error('========================================')
    console.error('Error:', error)
    console.error('\nTests will fail because required data does not exist.')
    console.error('Fix the seeding issue before running tests.')
    console.error('========================================\n')
    throw error // Re-throw to fail the test suite
  }
}

export default globalSetup
