<script setup lang="ts">
import { computed } from 'vue'
import { statusMeta } from '@/utils/format'

const props = defineProps<{
  status?: string | null
  label?: string
  pulse?: boolean
}>()

const meta = computed(() => statusMeta(props.status))
</script>

<template>
  <span class="status-pill" :class="`tone-${meta.tone}`">
    <span v-if="pulse && status === 'RUNNING'" class="pulse" />
    <i v-else />
    {{ label || meta.label }}
  </span>
</template>
