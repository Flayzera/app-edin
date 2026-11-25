<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useBarStore } from '../stores/bar'
import ScreenHeader from '../components/ScreenHeader.vue'
import TableCard from '../components/TableCard.vue'

const bar = useBarStore()
const router = useRouter()
const creating = ref(false)
const name = ref('')

const cards = computed(() =>
  bar.tables
    .filter((table) => bar.openComandaFor(table.id))
    .map((table) => {
      const comanda = bar.openComandaFor(table.id)
      return {
        table,
        dueCents: comanda ? bar.dueOf(comanda.id) : 0,
        itemQty: bar.tableItemQty(table.id),
      }
    }),
)

function start() {
  name.value = ''
  creating.value = true
}

async function create() {
  const tableId = await bar.openTable(name.value)
  if (!tableId) return
  creating.value = false
  name.value = ''
  await router.push({ name: 'comanda', params: { tableId } })
}
</script>

<template>
  <main class="screen">
    <ScreenHeader
      eyebrow="Balcão"
      title="Mesas"
      subtitle="Abra uma mesa quando alguém sentar. Ao fechar, ela sai da lista."
    >
      <Button v-if="!creating" label="Abrir mesa" icon="pi pi-plus" @click="start" />
    </ScreenHeader>

    <form v-if="creating" class="stack" @submit.prevent="create">
      <FloatLabel variant="on" class="field">
        <InputText id="table-name" v-model="name" maxlength="24" required autocomplete="off" />
        <label for="table-name">Nome da mesa</label>
      </FloatLabel>
      <div class="actions">
        <Button label="Cancelar" severity="secondary" outlined type="button" @click="creating = false" />
        <Button label="Abrir" type="submit" :disabled="bar.busy" />
      </div>
    </form>

    <Message v-else-if="cards.length === 0" severity="secondary" :closable="false" icon="pi pi-th-large">
      Nenhuma mesa aberta.
    </Message>
    <div v-else class="grid-tables">
      <TableCard
        v-for="card in cards"
        :key="card.table.id"
        :name="card.table.name"
        :due-cents="card.dueCents"
        :item-qty="card.itemQty"
        @click="router.push({ name: 'comanda', params: { tableId: card.table.id } })"
      />
    </div>
  </main>
</template>
