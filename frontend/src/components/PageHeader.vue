<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  eyebrow?: string
}>()
</script>

<template>
  <div class="page-head">
    <div class="page-head-copy">
      <div v-if="eyebrow" class="eyebrow">{{ eyebrow }}</div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
