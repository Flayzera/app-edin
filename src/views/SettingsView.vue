<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Timeline from 'primevue/timeline'
import { useBarStore } from '../stores/bar'
import { formatDateTime } from '../money'
import ScreenHeader from '../components/ScreenHeader.vue'

const bar = useBarStore()
const fileInput = ref<HTMLInputElement | null>(null)
const pixKey = ref('')
const pixName = ref('')
const pixCity = ref('')

watch(
  () => [bar.pix.key, bar.pix.name, bar.pix.city],
  () => {
    pixKey.value = bar.pix.key
    pixName.value = bar.pix.name
    pixCity.value = bar.pix.city
  },
  { immediate: true },
)

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
    'Isso apaga mesas, contas, produtos, estoque e o registro deste celular e coloca o que está no arquivo.',
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

    <p class="section-label">Pix</p>
    <Card>
      <template #content>
        <p class="hint">O QR leva esta chave e o valor da conta. O app não recebe o Pix.</p>
        <div class="stack" style="margin-top: 0.85rem">
          <FloatLabel variant="on" class="field">
            <InputText id="pix-key" v-model="pixKey" autocomplete="off" />
            <label for="pix-key">Chave Pix</label>
          </FloatLabel>
          <FloatLabel variant="on" class="field">
            <InputText id="pix-name" v-model="pixName" maxlength="25" autocomplete="off" />
            <label for="pix-name">Nome de quem recebe</label>
          </FloatLabel>
          <FloatLabel variant="on" class="field">
            <InputText id="pix-city" v-model="pixCity" maxlength="15" autocomplete="off" />
            <label for="pix-city">Cidade</label>
          </FloatLabel>
          <Button class="wide-btn" label="Salvar chave" icon="pi pi-check" :disabled="bar.busy" @click="bar.savePix({ key: pixKey, name: pixName, city: pixCity })" />
        </div>
      </template>
    </Card>

    <div class="stack" style="margin-top: 1rem">
      <Button class="wide-btn" label="Exportar JSON" icon="pi pi-download" severity="secondary" outlined @click="bar.exportBackup()" />
      <Button class="wide-btn" label="Importar JSON" icon="pi pi-upload" severity="secondary" outlined @click="pickFile" />
      <input ref="fileInput" hidden type="file" accept="application/json,.json" @change="onFile" />
    </div>

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
  </main>
</template>
