import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Home - uses dynamic layout based on auth state
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/HomePage.vue'),
      meta: { layout: 'dynamic' },
    },

    // Guest-only routes (login, register) - use DefaultLayout
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { guest: true, layout: 'default' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/pages/RegisterPage.vue'),
      meta: { guest: true, layout: 'default' },
    },

    // Steam sign-in completion — the backend redirects here with tokens
    // in the URL fragment. Not marked `guest`: by the time the page acts,
    // the user becomes authenticated and a guest guard would bounce them.
    {
      path: '/auth/steam/complete',
      name: 'steam-complete',
      component: () => import('@/pages/SteamCompletePage.vue'),
      meta: { layout: 'default' },
    },

    // Public browse routes - use dynamic layout
    {
      path: '/leagues',
      name: 'leagues',
      component: () => import('@/pages/LeaguesPage.vue'),
      meta: { layout: 'dynamic' },
    },
    {
      path: '/leagues/:id',
      name: 'league-detail',
      component: () => import('@/pages/LeagueDetailPage.vue'),
      meta: { layout: 'dynamic' },
    },
    {
      path: '/players',
      name: 'players',
      component: () => import('@/pages/PlayersPage.vue'),
      meta: { layout: 'dynamic' },
    },
    {
      path: '/players/:id',
      name: 'player-detail',
      component: () => import('@/pages/PlayerDetailPage.vue'),
      meta: { layout: 'dynamic' },
    },

    // Tournament routes - public
    {
      path: '/tournaments',
      name: 'tournaments',
      component: () => import('@/pages/TournamentsPage.vue'),
      meta: { layout: 'dynamic' },
    },
    {
      path: '/tournaments/:slug',
      name: 'tournament-detail',
      component: () => import('@/pages/TournamentDetailPage.vue'),
      meta: { layout: 'dynamic' },
    },
    {
      path: '/tournaments/:tournamentSlug/matches/:matchId',
      name: 'match-detail',
      component: () => import('@/pages/MatchDetailPage.vue'),
      meta: { layout: 'dynamic' },
    },

    // Authenticated user routes - use PortalLayout
    {
      path: '/my-teams',
      name: 'my-teams',
      component: () => import('@/pages/MyLeagueTeamsPage.vue'),
      meta: { requiresAuth: true, layout: 'portal' },
    },
    {
      path: '/invitations',
      name: 'invitations',
      component: () => import('@/pages/InvitationsPage.vue'),
      meta: { requiresAuth: true, layout: 'portal' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/pages/ProfilePage.vue'),
      meta: { requiresAuth: true, layout: 'portal' },
    },
    {
      path: '/profile/edit',
      name: 'profile-edit',
      component: () => import('@/pages/ProfileEditPage.vue'),
      meta: { requiresAuth: true, layout: 'portal' },
    },
    {
      path: '/profile/availability',
      name: 'profile-availability',
      component: () => import('@/pages/PlayerAvailabilityPage.vue'),
      meta: { requiresAuth: true, layout: 'portal' },
    },

    // Team routes - dynamic layout (can be viewed by anyone)
    {
      path: '/teams/:id',
      name: 'team-detail',
      component: () => import('@/pages/TeamDetailPage.vue'),
      meta: { layout: 'dynamic' },
    },
    {
      path: '/teams/:id/edit',
      name: 'team-edit',
      component: () => import('@/pages/TeamEditPage.vue'),
      meta: { requiresAuth: true, layout: 'portal' },
    },

    // Redirects for old routes
    {
      path: '/teams',
      redirect: '/my-teams',
    },
    {
      path: '/teams/new',
      redirect: '/leagues',
    },

    // Admin routes - use AdminLayout
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresAdmin: true, layout: 'admin' },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('@/pages/admin/AdminDashboardPage.vue'),
        },
        {
          path: 'games',
          name: 'admin-games',
          component: () => import('@/pages/admin/AdminGamesPage.vue'),
        },
        {
          path: 'leagues',
          name: 'admin-leagues',
          component: () => import('@/pages/admin/AdminLeaguesPage.vue'),
        },
        {
          path: 'bans',
          name: 'admin-bans',
          component: () => import('@/pages/admin/AdminBansPage.vue'),
        },
        {
          path: 'permissions',
          name: 'admin-permissions',
          component: () => import('@/pages/admin/AdminPermissionsPage.vue'),
        },
        {
          path: 'players',
          name: 'admin-players',
          component: () => import('@/pages/admin/AdminPlayersPage.vue'),
        },
        {
          path: 'teams',
          name: 'admin-teams',
          component: () => import('@/pages/admin/AdminTeamsPage.vue'),
        },
        {
          path: 'tournaments',
          name: 'admin-tournaments',
          component: () => import('@/pages/admin/AdminTournamentsPage.vue'),
        },
        {
          path: 'tournaments/:id',
          name: 'admin-tournament-detail',
          component: () => import('@/pages/admin/AdminTournamentDetailPage.vue'),
        },
        {
          path: 'demos',
          name: 'admin-demos',
          component: () => import('@/pages/admin/AdminDemosPage.vue'),
        },
        {
          path: 'demos/:id',
          name: 'admin-demo-detail',
          component: () => import('@/pages/admin/AdminDemoDetailPage.vue'),
        },
        {
          path: 'disputes',
          name: 'admin-disputes',
          component: () => import('@/pages/admin/AdminDisputesPage.vue'),
        },
        {
          path: 'result-reviews',
          name: 'admin-result-reviews',
          component: () => import('@/pages/admin/AdminResultReviewsPage.vue'),
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('@/pages/admin/AdminSettingsPage.vue'),
        },
      ],
    },
  ],
})

// Navigation guard for authentication and authorization
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // Wait for auth initialization on first navigation
  if (!authStore.initialized) {
    await authStore.initialize()
  }

  const isAuthenticated = authStore.isAuthenticated

  // Redirect authenticated users away from guest-only pages (login, register)
  if (to.meta.guest && isAuthenticated) {
    next({ name: 'home' })
    return
  }

  // Redirect unauthenticated users to login for protected routes
  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  // Redirect non-admin users away from admin routes
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    next({ name: 'home' })
    return
  }

  next()
})

export default router
