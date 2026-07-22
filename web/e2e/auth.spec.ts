import { test, expect } from '@playwright/test'
import { login, register, clearAuthState } from './fixtures/auth.fixture'
import { testUsers } from './fixtures/test-data'

test.describe('Authentication', () => {
  test.describe('User Registration', () => {
    test('should register a new user successfully', async ({ page }) => {
      const userData = testUsers.standard()

      await page.goto('/register')

      // Fill the registration form - use specific selectors
      await page.getByRole('textbox', { name: 'Username' }).fill(userData.username)
      await page.getByRole('textbox', { name: 'Email' }).fill(userData.email)
      await page.locator('input[type="password"]').first().fill(userData.password)
      await page.getByRole('textbox', { name: 'Display Name' }).fill(userData.display_name)

      // Submit the form
      await page.getByRole('button', { name: 'Create Account' }).click()

      // Verify success message appears
      await expect(page.getByText('Registration successful')).toBeVisible()
    })

    test('should show validation error for short username', async ({ page }) => {
      await page.goto('/register')

      // Fill with invalid data
      await page.getByRole('textbox', { name: 'Username' }).fill('ab') // Too short
      await page.getByRole('textbox', { name: 'Email' }).fill('test@example.com')
      await page.locator('input[type="password"]').first().fill('TestPassword123!')

      // Blur to trigger validation
      await page.getByRole('textbox', { name: 'Email' }).blur()

      // Validation error should appear (useFormRules.minLength returns
      // "Must be at least N characters").
      await expect(page.getByText('Must be at least 3 characters')).toBeVisible()
    })

    test('should show validation error for invalid email', async ({ page }) => {
      await page.goto('/register')

      // Fill with invalid email
      await page.getByRole('textbox', { name: 'Username' }).fill('testuser')
      await page.getByRole('textbox', { name: 'Email' }).fill('invalid-email')
      await page.getByRole('textbox', { name: 'Email' }).blur()

      // Validation error should appear (useFormRules.email returns "Invalid email").
      await expect(page.getByText('Invalid email')).toBeVisible()
    })

    test('should show validation error for short password', async ({ page }) => {
      await page.goto('/register')

      // Fill with short password
      const passwordInput = page.locator('input[type="password"]').first()
      await passwordInput.fill('short')
      await passwordInput.blur()

      // Validation error should appear.
      await expect(page.getByText('Must be at least 8 characters')).toBeVisible()
    })

    test('should show error for duplicate username', async ({ page }) => {
      // First registration
      const userData = testUsers.standard()
      await register(page, userData)

      // Clear auth state so we can access register page again
      await clearAuthState(page)

      // Try to register again with same username
      await page.goto('/register')
      await page.getByRole('textbox', { name: 'Username' }).fill(userData.username)
      await page.getByRole('textbox', { name: 'Email' }).fill('different@example.com')
      await page.locator('input[type="password"]').first().fill(userData.password)
      await page.getByRole('button', { name: 'Create Account' }).click()

      // Error alert should appear
      await expect(page.locator('.v-alert').filter({ hasText: /already|exists|taken/i })).toBeVisible()
    })
  })

  test.describe('User Login', () => {
    test('should login with valid credentials', async ({ page }) => {
      // First register a user
      const userData = testUsers.standard()
      await register(page, userData)

      // Clear auth state so we can access login page
      await clearAuthState(page)

      // Now login
      await page.goto('/login')
      await page.getByRole('textbox', { name: 'Username or Email' }).fill(userData.username)
      await page.locator('input[type="password"]').first().fill(userData.password)
      await page.getByRole('button', { name: 'Login' }).click()

      // Should redirect to home page
      await expect(page).toHaveURL('/')
    })

    test('should login with email instead of username', async ({ page }) => {
      // First register a user
      const userData = testUsers.standard()
      await register(page, userData)

      // Clear auth state so we can access login page
      await clearAuthState(page)

      // Login with email
      await page.goto('/login')
      await page.getByRole('textbox', { name: 'Username or Email' }).fill(userData.email)
      await page.locator('input[type="password"]').first().fill(userData.password)
      await page.getByRole('button', { name: 'Login' }).click()

      // Should redirect to home page
      await expect(page).toHaveURL('/')
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login')

      // Try to login with invalid credentials
      await page.getByRole('textbox', { name: 'Username or Email' }).fill(testUsers.invalid.username_or_email)
      await page.locator('input[type="password"]').first().fill(testUsers.invalid.password)
      await page.getByRole('button', { name: 'Login' }).click()

      // Error should appear
      await expect(page.locator('.v-alert')).toBeVisible()
    })

    test('should toggle password visibility', async ({ page }) => {
      await page.goto('/login')

      // Get the password field container to scope our queries
      const passwordField = page.locator('.v-text-field').filter({ hasText: 'Password' })
      const passwordInput = passwordField.locator('input')

      await passwordInput.fill('testpassword')

      // Initially password should be hidden
      await expect(passwordInput).toHaveAttribute('type', 'password')

      // Click the visibility toggle (eye-off icon indicates password is hidden)
      await passwordField.locator('.mdi-eye-off').click()

      // Password should now be visible (type changes to text)
      await expect(passwordInput).toHaveAttribute('type', 'text')
      await expect(passwordInput).toHaveValue('testpassword')

      // Click again to hide (eye icon indicates password is visible)
      await passwordField.locator('.mdi-eye').click()

      // Password should be hidden again
      await expect(passwordInput).toHaveAttribute('type', 'password')
      await expect(passwordInput).toHaveValue('testpassword')
    })

    test('should show required field validation', async ({ page }) => {
      await page.goto('/login')

      // Click login without filling fields
      await page.getByRole('button', { name: 'Login' }).click()

      // Required validation should appear
      await expect(page.getByText('Required').first()).toBeVisible()
    })

    test('should redirect to intended page after login', async ({ page }) => {
      // Register a user so we have working credentials, then drop the session
      // so the auth guard actually fires on the next navigation.
      const userData = testUsers.standard()
      await register(page, userData)
      await clearAuthState(page)

      // `/profile` is a genuinely protected route — `meta.requiresAuth: true`
      // at src/router/index.ts:99-103. The guard at src/router/index.ts:240-243
      // bounces unauthenticated visitors to `login` with `?redirect=<fullPath>`.
      //
      // This test previously targeted `/tournaments`, which is PUBLIC
      // (src/router/index.ts:66-71) and was additionally visited while still
      // authenticated — so no redirect ever happened, the `if (…/login…)` body
      // never ran, and the test could not fail.
      await page.goto('/profile')
      await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)profile/)

      // Log in from the page the guard sent us to.
      await page.getByRole('textbox', { name: 'Username or Email' }).fill(userData.username)
      await page.locator('input[type="password"]').first().fill(userData.password)
      await page.getByRole('button', { name: 'Login' }).click()

      // LoginPage.handleSubmit pushes `query.redirect` (src/pages/LoginPage.vue:101-102),
      // so we land on the originally intended page — not on `/`.
      await expect(page).toHaveURL('/profile')
      // …and the protected page really rendered (ProfilePage's edit link).
      await expect(page.getByRole('link', { name: 'Edit Profile' })).toBeVisible()
    })
  })

  test.describe('Navigation Links', () => {
    test('should navigate from login to register page', async ({ page }) => {
      await page.goto('/login')

      // Click register link in main content (not navbar)
      await page.getByRole('main').getByRole('link', { name: 'Register' }).click()

      // Should be on register page
      await expect(page).toHaveURL('/register')
    })
  })

  test.describe('Session Persistence', () => {
    test('should maintain session after page refresh', async ({ page }) => {
      // Register and login
      const userData = testUsers.standard()
      await register(page, userData)
      await login(page, { username_or_email: userData.username, password: userData.password })

      // Verify we're logged in (on home page)
      await expect(page).toHaveURL('/')

      // Refresh the page
      await page.reload()

      // Should still be logged in (not redirected to login)
      await expect(page).toHaveURL('/')
    })
  })
})
