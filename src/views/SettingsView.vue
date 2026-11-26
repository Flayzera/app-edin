<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Timeline from 'primevue/timeline'
import { useBarStore } from '../stores/bar'
import { formatDateTime } from '../money'
import ScreenHeader from '../components/ScreenHeader.vue'

const bar = useBarStore()
const fileInput = ref<HTMLInputElement | null>(null)

function pickFile() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const ok = await bar.ask(
    'Substituir dados',
    'Isso apaga mesas, contas, produtos, estoque, o caixa e o registro deste celular e coloca o que está no arquivo.',
    'Substituir',
  )
  if (ok) await bar.importBackup(file)
}
</script>

<template>
  <main class="screen">
    <ScreenHeader
      eyebrow="Ajustes"
      title="Cópia"
      subtitle="Os dados ficam neste celular. O registro mostra o que aconteceu, na ordem."
    />

    <div class="settings-layout">
    <div class="stack">
      <Button class="wide-btn" label="Exportar JSON" icon="pi pi-download" severity="secondary" outlined @click="bar.exportBackup()" />
      <Button class="wide-btn" label="Importar JSON" icon="pi pi-upload" severity="secondary" outlined @click="pickFile" />
      <input ref="fileInput" hidden type="file" accept="application/json,.json" @change="onFile" />
    </div>

    <div>
    <p class="section-label">Registro</p>
    <Message v-if="bar.audits.length === 0" severity="secondary" :closable="false" icon="pi pi-list">
      Nenhuma ação registrada ainda.
    </Message>
    <Timeline v-else :value="bar.audits" align="left" class="audit">
      <template #content="{ item }">
        <Card>
          <template #content>
            <div class="row-between">
              <strong>{{ item.action }}</strong>
              <span class="muted">{{ formatDateTime(item.createdAt) }}</span>
            </div>
            <p class="movement">{{ item.detail }}</p>
          </template>
        </Card>
      </template>
    </Timeline>
    </div>
    </div>
  </main>
</template>
