<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  subtitle?: string
}>()
</script>

<template>
  <header class="top">
    <div class="top-copy">
      <p v-if="eyebrow" class="kicker">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
    </div>
    <slot />
  </header>
</template>
