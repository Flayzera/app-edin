<script setup lang="ts">
import Drawer from 'primevue/drawer'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

function onVisible(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <Drawer
    visible
    position="bottom"
    :header="title"
    :pt="{ root: { class: 'sheet-drawer' } }"
    @update:visible="onVisible"
  >
    <slot />
  </Drawer>
</template>
