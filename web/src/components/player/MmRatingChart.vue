<template>
  <Line :data="data" :options="options" />
</template>

<script setup lang="ts">
// Isolated so chart.js only loads when a chart actually renders — it is the
// heaviest dependency on the profile/player pages and most visits never see
// a chart (needs >1 rated match). Loaded via defineAsyncComponent.
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

defineProps<{
  data: ChartData<'line'>
  options: ChartOptions<'line'>
}>()
</script>
