<script setup lang="ts">
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import ProgressSpinner from 'primevue/progressspinner'
import Toast from 'primevue/toast'
import { useBarStore } from './stores/bar'
import AppNav from './components/AppNav.vue'

const bar = useBarStore()
const { ready, notice, dialog } = storeToRefs(bar)
const toast = useToast()

watch(notice, (message) => {
  if (!message) return
  toast.add({ severity: 'info', summary: message, life: 2800 })
  bar.dismissNotice()
})
</script>

<template>
  <div v-if="!ready" class="boot">
    <ProgressSpinner style="width: 2.5rem; height: 2.5rem" strokeWidth="4" />
    <span>Abrindo o balcão…</span>
  </div>
  <div v-else class="shell">
    <AppNav />
    <div class="shell-main">
      <RouterView />
    </div>
  </div>
  <Toast position="top-center" />
  <Dialog
    :visible="dialog !== null"
    modal
    dismissableMask
    :header="dialog?.title ?? ''"
    :style="{ width: 'min(26rem, calc(100vw - 2rem))' }"
    @update:visible="(open) => { if (!open) bar.answer(false) }"
  >
    <p class="subtitle">{{ dialog?.body }}</p>
    <template #footer>
      <Button label="Cancelar" severity="secondary" text @click="bar.answer(false)" />
      <Button :label="dialog?.confirmLabel ?? 'Confirmar'" severity="danger" @click="bar.answer(true)" />
    </template>
  </Dialog>
</template>
