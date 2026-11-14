<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: string
  }>(),
  { icon: '✦' }
)
</script>

<template>
  <div class="empty-block">
    <div class="empty-glyph">{{ icon }}</div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 56px 24px;
  border: 1px dashed var(--ft-line-strong);
  border-radius: 15px;
  background:
    radial-gradient(circle at 50% 0%, rgba(91, 91, 214, 0.05), transparent 55%),
    #fff;
}

.empty-glyph {
  width: 48px;
  height: 48px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: #f2f2fb;
  color: var(--ft-primary);
  font-size: 20px;
  margin-bottom: 14px;
}

h3 {
  margin: 0 0 6px;
  font-size: 15px;
  letter-spacing: -0.01em;
}

p {
  margin: 0;
  color: var(--ft-muted);
  font-size: 12px;
  max-width: 420px;
  line-height: 1.7;
}

.empty-action {
  margin-top: 18px;
}
</style>
