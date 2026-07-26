<!--
  Invite a player onto a team's seasonal roster.

  SHARED between two surfaces, which is why it lives under `components/team/`
  rather than `components/admin/` (COVERAGE-PLAN §9b P-12):
    - admin: `components/admin/LeagueTeamDetailModal.vue` (from /admin/teams
      and /admin/leagues), which knows the season and passes `rosterLockStatus`
    - captain: `pages/TeamDetailPage.vue`, the captain's own team page

  The endpoint behind it (`POST /v1/league-team-seasons/{id}/invitations`) is
  captain-or-admin (`require_captain_or_admin`,
  portal-api/src/handlers/league_teams/invitation.rs:50), so nothing here was
  ever admin-specific.
-->
<template>
  <v-dialog
    v-model="open"
    max-width="500"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Invite Player to Team</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-autocomplete
                v-model="form.player_id"
                v-model:search="playerSearch"
                :items="playerResults"
                :loading="searchingPlayers"
                item-title="display_name"
                item-value="id"
                label="Search Player"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-magnify"
                no-filter
                clearable
                return-object
                @update:search="searchPlayers"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <template v-slot:prepend>
                      <v-avatar size="32">
                        <v-img alt="" v-if="item.raw.avatar_url" :src="item.raw.avatar_url" />
                        <v-icon v-else>mdi-account</v-icon>
                      </v-avatar>
                    </template>
                    <v-list-item-subtitle>{{ item.raw.id.substring(0, 8) }}...</v-list-item-subtitle>
                  </v-list-item>
                </template>
                <template v-slot:no-data>
                  <v-list-item v-if="playerSearch && playerSearch.length >= 2">
                    <v-list-item-title>No players found</v-list-item-title>
                  </v-list-item>
                  <v-list-item v-else>
                    <v-list-item-title>Type at least 2 characters to search</v-list-item-title>
                  </v-list-item>
                </template>
              </v-autocomplete>
            </v-col>

            <v-col cols="12">
              <v-select
          aria-label="Role"
                v-model="form.role"
                :items="roleOptions"
                item-title="label"
                item-value="value"
                label="Role"
                variant="outlined"
                density="comfortable"
                :hint="roleHint ?? undefined"
                :persistent-hint="!!roleHint"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.message"
                label="Message (Optional)"
                :rules="[rules.maxLength(500)]"
                rows="2"
                variant="outlined"
                density="comfortable"
                hint="Optional message to include with the invitation"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="sending"
          :disabled="!formValid || !form.player_id"
          @click="send"
        >
          Send Invitation
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, ApiError } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import { useFormRules } from '@/composables/useFormRules'
import {
  allowsPrimaryRosterChanges,
  allowsSubstituteChanges,
  rosterLockHint,
} from '@/utils/rosterLock'
import {
  useLeagueTeamsStore,
  type InviteToLeagueTeamRequest,
} from '@/stores/leagueTeams'

interface PlayerSearchResult {
  id: string
  display_name: string
  avatar_url: string | null
}

const props = defineProps<{  teamSeasonId: string
  /**
   * The season's `roster_lock_status` (`open` / `soft_lock` / `hard_lock`).
   * Optional: surfaces that cannot see it (e.g. the captain's own team page,
   * whose `LeagueTeamResponse` carries no season fields) omit it and get the
   * unrestricted role list — the API still enforces the lock.
   */
  rosterLockStatus?: string | null
}>()

const emit = defineEmits<{  invited: []
}>()

const open = defineModel<boolean>({ required: true })

const leagueTeamsStore = useLeagueTeamsStore()

const formRef = ref()
const formValid = ref(false)
const sending = computed(() => leagueTeamsStore.invitePlayerState.loading)
const error = ref<string | null>(null)

// Player search
const playerSearch = ref('')
const playerResults = ref<PlayerSearchResult[]>([])
const searchingPlayers = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const form = ref<{
  player_id: PlayerSearchResult | null
  role: string
  message: string
}>({
  player_id: null,
  role: 'player',
  message: '',
})

/**
 * Roles the season's roster lock still permits inviting for.
 *
 * `captain` and `player` are PRIMARY roles (`LeagueTeamRole::is_primary`,
 * portal-core/src/types/league_team.rs:311) and are rejected by
 * `LeagueTeamInvitationService::create_invitation`
 * (portal-domain/src/services/league_team/invitation.rs:85-89) unless the
 * season allows primary roster changes. Offering them under a soft lock would
 * be offering a guaranteed 400.
 */
const roleOptions = computed(() => {
  const all = [
    { value: 'player', label: 'Player' },
    { value: 'substitute', label: 'Substitute' },
    { value: 'captain', label: 'Captain' },
  ]
  const primaryAllowed = allowsPrimaryRosterChanges(props.rosterLockStatus)
  const substitutesAllowed = allowsSubstituteChanges(props.rosterLockStatus)
  return all.filter((option) =>
    option.value === 'substitute' ? substitutesAllowed : primaryAllowed,
  )
})

/** First still-permitted role; `player` whenever the roster is open. */
const defaultRole = computed(() => roleOptions.value[0]?.value ?? 'player')

const roleHint = computed(() =>
  allowsPrimaryRosterChanges(props.rosterLockStatus) ? null : rosterLockHint(props.rosterLockStatus),
)

const rules = useFormRules()

async function searchPlayers(search: string) {
  if (!search || search.length < 2) {
    playerResults.value = []
    return
  }

  // Debounce search
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  searchTimeout = setTimeout(async () => {
    searchingPlayers.value = true
    try {
      const result = await unwrapApi(api.GET('/v1/players', {
        params: { query: { q: search, per_page: 10 } },
      }))
      playerResults.value = result.data.map((p) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url ?? null,
      }))
    } catch {
      playerResults.value = []
    } finally {
      searchingPlayers.value = false
    }
  }, 300)
}

watch(open, (isOpen) => {
  if (isOpen) {
    form.value = {
      player_id: null,
      role: defaultRole.value,
      message: '',
    }
    playerSearch.value = ''
    playerResults.value = []
    error.value = null
  }
})

function close() {
  error.value = null
  open.value = false
}

async function send() {
  if (!formValid.value || !props.teamSeasonId || !form.value.player_id) return
  error.value = null

  const body: InviteToLeagueTeamRequest = {
    player_id: form.value.player_id.id,
    role: form.value.role,
  }
  if (form.value.message) body.message = form.value.message

  try {
    await leagueTeamsStore.invitePlayer(props.teamSeasonId, body)
    emit('invited')
    close()
  } catch (e) {
    error.value = e instanceof ApiError
      ? e.detail
      : (leagueTeamsStore.invitePlayerState.error ?? 'Failed to send invitation')
  }
}
</script>
