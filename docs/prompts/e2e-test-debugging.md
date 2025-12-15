# E2E Test Debugging Prompt

## Context

We have implemented Playwright E2E tests for the gaming portal frontend. The tests are located in `/web/e2e/` and cover authentication, tournament flows, admin operations, and team management.

When running the tests with `DISPLAY=:0 npm run test:e2e`, many tests are failing. Your task is to systematically debug these failures and implement fixes.

## Current Test Results Summary

**Auth tests (`e2e/auth.spec.ts`):**
- 7 passing, 7 failing
- Key failure: Registration fails with "Registration failed" error from backend

**Root Cause Identified for Auth:**
The backend JSON parser is rejecting passwords containing `!` character:
```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"TestPassword123!","display_name":"Test"}'

# Returns: "Failed to parse the request body as JSON: password: invalid escape at line 1 column 85"
```

However, passwords WITHOUT `!` work fine:
```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"TestPassword123","display_name":"Test"}'

# Returns: Success with access_token
```

## Debugging Methodology

For each failing test, determine which category the failure falls into:

### 1. Test Data Issue
- Incorrect test data (like the password with `!`)
- Missing seed data that tests depend on
- Data format mismatches

### 2. Test Expectation Issue
- Wrong selectors (we already fixed Vuetify's dual-label issue with password fields)
- Wrong expected text/values
- Wrong expected URLs or navigation paths
- Timing issues (not waiting for async operations)

### 3. Test Workflow Issue
- Tests following wrong user flow for the frontend
- Missing steps in the test workflow
- Incorrect assumptions about frontend behavior

### 4. Frontend Issue
- Frontend not implementing expected behavior correctly
- Missing error handling
- Incorrect API calls or data transformations

### 5. Backend Issue
- API returning errors for valid requests (like the `!` password issue)
- Missing endpoints
- Incorrect response formats
- Validation too strict or incorrect

## Tasks

### Task 1: Fix the Backend Password Parsing Issue

The backend at `/api/crates/portal-api/` is rejecting valid JSON with `!` in passwords.

1. Find the registration endpoint handler in `crates/portal-api/src/handlers/`
2. Find the request body struct (likely in `crates/portal-api/src/dto/requests/`)
3. Investigate why the JSON parser is failing on `!` characters
4. This might be related to:
   - Custom deserializer on the password field
   - serde configuration
   - A regex or validation that's misinterpreting the character

### Task 2: Run and Analyze All E2E Tests

After fixing the backend issue, run each test file and categorize failures:

```bash
cd /mnt/c/Users/Max/community_gaming/web

# Run auth tests
DISPLAY=:0 npx playwright test e2e/auth.spec.ts --reporter=list

# Run tournament public tests
DISPLAY=:0 npx playwright test e2e/tournament-public.spec.ts --reporter=list

# Run tournament admin tests
DISPLAY=:0 npx playwright test e2e/tournament-admin.spec.ts --reporter=list

# Run team management tests
DISPLAY=:0 npx playwright test e2e/team-management.spec.ts --reporter=list
```

For each failure:
1. Read the error message
2. Check the screenshot in `test-results/*/test-failed-*.png`
3. Check the error context in `test-results/*/error-context.md`
4. Determine the root cause category
5. Implement the fix

### Task 3: Fix Identified Issues

Based on your analysis, implement fixes in order of:
1. Backend issues (affects all tests)
2. Test data issues (affects multiple tests)
3. Test expectation/workflow issues (affects specific tests)
4. Frontend issues (if any discovered)

### Task 4: Verify All Tests Pass

After fixes, run the full test suite:
```bash
DISPLAY=:0 npm run test:e2e
```

## Key Files

### Test Files
- `/web/e2e/auth.spec.ts` - Authentication tests
- `/web/e2e/tournament-public.spec.ts` - Public tournament flow tests
- `/web/e2e/tournament-admin.spec.ts` - Admin tournament management tests
- `/web/e2e/team-management.spec.ts` - Team management tests
- `/web/e2e/fixtures/auth.fixture.ts` - Auth helper functions
- `/web/e2e/fixtures/test-data.ts` - Test data constants

### Frontend Files
- `/web/src/pages/LoginPage.vue` - Login page
- `/web/src/pages/RegisterPage.vue` - Registration page
- `/web/src/pages/TournamentsPage.vue` - Tournament list
- `/web/src/pages/TournamentDetailPage.vue` - Tournament detail
- `/web/src/pages/admin/AdminTournamentDetailPage.vue` - Admin tournament management
- `/web/src/stores/auth.ts` - Auth store
- `/web/src/stores/tournaments.ts` - Tournaments store

### Backend Files
- `/api/crates/portal-api/src/handlers/auth.rs` - Auth handlers
- `/api/crates/portal-api/src/dto/requests/auth.rs` - Auth request DTOs
- `/api/crates/portal-api/src/dto/requests/mod.rs` - Request DTOs module

## Notes

- The frontend dev server runs on `http://localhost:5173`
- The API server runs on `http://localhost:3000`
- Dev mode authentication is available via "Enable Dev Mode" button on login page
- Tests use `DISPLAY=:0` for headed browser mode on WSL with WSLg
- Playwright config is at `/web/playwright.config.ts`

## Success Criteria

- All E2E tests pass
- No workarounds that skip actual functionality testing
- Backend properly handles all valid JSON inputs
- Tests accurately reflect the expected user workflows
