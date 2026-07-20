<template>
  <div class="color-picker">
    <v-label v-if="label" class="mb-2">{{ label }}</v-label>
    <div class="picker-row">
      <div class="color-preview-wrapper">
        <input
          type="color"
          aria-label="Pick color"
          :value="color || '#000000'"
          @input="handleColorInput"
          class="color-input"
        />
        <div
          class="color-preview"
          :style="{ backgroundColor: color || '#000000' }"
        />
      </div>
      <v-text-field
        :model-value="color || ''"
        aria-label="Hex color code"
        @update:model-value="handleTextInput"
        density="compact"
        variant="outlined"
        placeholder="#RRGGBB"
        :rules="[validateHex]"
        hide-details="auto"
        class="hex-input"
      />
      <v-btn aria-label="Clear color"
        v-if="color && clearable"
        icon
        variant="text"
        size="small"
        @click="color = null"
      >
        <v-icon>mdi-close</v-icon>
        <v-tooltip activator="parent" location="top">Clear</v-tooltip>
      </v-btn>
    </div>
    <div v-if="hint" class="text-caption text-medium-emphasis mt-1">
      {{ hint }}
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  label?: string
  hint?: string
  clearable?: boolean
}

withDefaults(defineProps<Props>(), {
  label: undefined,
  hint: undefined,
  clearable: true,
})

const color = defineModel<string | null>({ default: null })

function handleColorInput(e: Event) {
  const target = e.target as HTMLInputElement
  color.value = target.value
}

function handleTextInput(value: string) {
  if (!value) {
    color.value = null
    return
  }
  // Auto-add # if missing
  if (value && !value.startsWith('#')) {
    value = '#' + value
  }
  color.value = value
}

function validateHex(v: string): boolean | string {
  if (!v) return true
  const hex = v.startsWith('#') ? v : '#' + v
  return /^#[0-9A-Fa-f]{6}$/.test(hex) || 'Invalid hex color'
}
</script>

<style scoped>
.picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-preview-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.color-preview {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  border: 2px solid rgb(var(--v-theme-outline));
  pointer-events: none;
}

.hex-input {
  max-width: 140px;
}
</style>
