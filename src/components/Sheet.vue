<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Drawer from 'primevue/drawer'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const wideQuery = window.matchMedia('(min-width: 960px)')
const wide = ref(wideQuery.matches)

function syncWide() {
  wide.value = wideQuery.matches
}

function onVisible(open: boolean) {
  if (!open) emit('close')
}

onMounted(() => wideQuery.addEventListener('change', syncWide))
onUnmounted(() => wideQuery.removeEventListener('change', syncWide))
</script>

<template>
  <Drawer
    visible
    :position="wide ? 'right' : 'bottom'"
    :header="title"
    :pt="{ root: { class: 'sheet-drawer' } }"
    @update:visible="onVisible"
  >
    <slot />
  </Drawer>
</template>
