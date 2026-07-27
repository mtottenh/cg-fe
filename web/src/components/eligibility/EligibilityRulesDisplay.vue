<template>
  <!-- Wrapping chips, neutral by default: entry requirements are ordinary
       configuration, not an alarm state. Pass/fail coloring appears only
       when the caller supplies viewer checks. -->
  <div v-if="items.length > 0" class="d-flex flex-wrap ga-2" data-testid="eligibility-rules">
    <v-chip
      v-for="item in items"
      :key="item.key"
      size="small"
      variant="tonal"
      :color="chipColor(item)"
      :data-testid="`rule-chip-${item.key}`"
    >
      <v-icon start size="small">{{ chipIcon(item) }}</v-icon>
      {{ item.text }}
      <v-tooltip
        v-if="item.status === 'fail' && item.actual != null"
        activator="parent"
        location="top"
      >
        You have {{ item.actual }}
      </v-tooltip>
      <v-tooltip
        v-else-if="item.kind === 'team'"
        activator="parent"
        location="top"
      >
        Checked against the team roster at registration
      </v-tooltip>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  describeRules,
  type EligibilityRules,
  type RuleDescriptor,
} from '@/composables/useEligibilityRules'
import type { RuleCheck } from '@/composables/useEligibilityCheck'

const props = defineProps<{
  rules: EligibilityRules
  /** Viewer verdicts from useEligibilityCheck — when provided, chips show
   * pass/fail state; otherwise they render neutrally. */
  checks?: RuleCheck[] | null
}>()

type DisplayItem = RuleDescriptor & { status?: RuleCheck['status']; actual?: string | null }

const items = computed<DisplayItem[]>(() => props.checks ?? describeRules(props.rules))

function chipColor(item: DisplayItem): string | undefined {
  switch (item.status) {
    case 'pass':
      return 'success'
    case 'fail':
      return 'error'
    default:
      return undefined
  }
}

function chipIcon(item: DisplayItem): string {
  switch (item.status) {
    case 'pass':
      return 'mdi-check-circle'
    case 'fail':
      return 'mdi-close-circle'
    default:
      return item.icon
  }
}
</script>
