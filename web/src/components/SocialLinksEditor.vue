<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-link-variant</v-icon>
      Social Links
    </v-card-title>
    <v-divider />
    <v-card-text>
      <v-text-field
        v-model="links.steam"
        label="Steam"
        prepend-inner-icon="mdi-steam"
        placeholder="https://steamcommunity.com/id/username"
        hint="Your Steam profile URL"
        persistent-hint
        density="comfortable"
        class="mb-4"
        @update:model-value="emitUpdate"
      />

      <v-text-field
        v-model="links.discord"
        label="Discord"
        prepend-inner-icon="mdi-discord"
        placeholder="username#1234"
        hint="Your Discord username"
        persistent-hint
        density="comfortable"
        class="mb-4"
        @update:model-value="emitUpdate"
      />

      <v-text-field
        v-model="links.twitch"
        label="Twitch"
        prepend-inner-icon="mdi-twitch"
        placeholder="twitchusername"
        hint="Your Twitch channel name"
        persistent-hint
        density="comfortable"
        class="mb-4"
        @update:model-value="emitUpdate"
      />

      <v-text-field
        v-model="links.twitter"
        label="Twitter/X"
        prepend-inner-icon="mdi-twitter"
        placeholder="@username"
        hint="Your Twitter/X handle"
        persistent-hint
        density="comfortable"
        class="mb-4"
        @update:model-value="emitUpdate"
      />

      <v-text-field
        v-model="links.youtube"
        label="YouTube"
        prepend-inner-icon="mdi-youtube"
        placeholder="https://youtube.com/@channel"
        hint="Your YouTube channel URL"
        persistent-hint
        density="comfortable"
        @update:model-value="emitUpdate"
      />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

export interface SocialLinks {
  steam?: string | null
  discord?: string | null
  twitch?: string | null
  twitter?: string | null
  youtube?: string | null
}

interface Props {
  modelValue?: SocialLinks
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({}),
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: SocialLinks): void
}>()

const links = reactive<SocialLinks>({
  steam: props.modelValue?.steam || '',
  discord: props.modelValue?.discord || '',
  twitch: props.modelValue?.twitch || '',
  twitter: props.modelValue?.twitter || '',
  youtube: props.modelValue?.youtube || '',
})

watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      links.steam = newVal.steam || ''
      links.discord = newVal.discord || ''
      links.twitch = newVal.twitch || ''
      links.twitter = newVal.twitter || ''
      links.youtube = newVal.youtube || ''
    }
  },
  { deep: true }
)

function emitUpdate() {
  // Only include non-empty values
  const result: SocialLinks = {}
  if (links.steam) result.steam = links.steam
  if (links.discord) result.discord = links.discord
  if (links.twitch) result.twitch = links.twitch
  if (links.twitter) result.twitter = links.twitter
  if (links.youtube) result.youtube = links.youtube
  emit('update:modelValue', result)
}
</script>
