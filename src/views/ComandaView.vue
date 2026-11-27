<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBarStore } from '../stores/bar'
import { formatCents } from '../money'
import { methodLabel } from '../labels'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import BillNote from '../components/BillNote.vue'
import ItemList from '../components/ItemList.vue'
import PaySheet from '../components/PaySheet.vue'
import ProductBoard from '../components/ProductBoard.vue'

const route = useRoute()
const router = useRouter()
const bar = useBarStore()
const payOpen = ref(false)
const noteOpen = ref(false)
const noteComandaId = ref<string | null>(null)
const leaving = ref(false)

const tableId = computed(() => String(route.params.tableId))
const table = computed(() => bar.tables.find((row) => row.id === tableId.value) ?? null)
const comanda = computed(() => bar.openComandaFor(tableId.value))
const due = computed(() => (comanda.value ? bar.dueOf(comanda.value.id) : 0))
const consumption = computed(() => (comanda.value ? bar.consumptionOf(comanda.value.id) : 0))
const paid = computed(() => (comanda.value ? bar.paidOf(comanda.value.id) : 0))
const openItems = computed(() => (comanda.value ? bar.itemsOf(comanda.value.id, 'open') : []))
const paidItems = computed(() => (comanda.value ? bar.itemsOf(comanda.value.id, 'paid') : []))
const cancelledItems = computed(() => (comanda.value ? bar.itemsOf(comanda.value.id, 'cancelled') : []))
const shares = computed(() =>
  comanda.value
    ? bar.payments.filter((payment) => payment.comandaId === comanda.value?.id && payment.payerName && !payment.debtId)
    : [],
)
const openSummary = computed(() => {
  const grouped = new Map<string, number>()
  for (const item of openItems.value) {
    grouped.set(item.name, (grouped.get(item.name) ?? 0) + item.qty)
  }
  return [...grouped.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
})
const noteComanda = computed(() => {
  if (noteComandaId.value) return bar.comandas.find((row) => row.id === noteComandaId.value) ?? comanda.value
  return comanda.value
})

async function ensure() {
  if (!table.value) {
    await router.replace('/')
    return
  }
  await bar.ensureComanda(table.value.id)
}

watch(tableId, async () => {
  leaving.value = true
  payOpen.value = false
  noteOpen.value = false
  noteComandaId.value = null
  await ensure()
  leaving.value = false
}, { immediate: true })

watch(comanda, (current, previous) => {
  if (leaving.value || !previous || current) return
  payOpen.value = false
  noteComandaId.value = previous.id
  noteOpen.value = true
})

function closeNote() {
  noteOpen.value = false
  if (!comanda.value) void router.replace('/')
}

function printNote() {
  window.print()
}

function payFromNote() {
  closeNote()
  payOpen.value = true
}

async function liberar() {
  if (!comanda.value) return
  await bar.closeComanda(comanda.value.id)
}

function onPaid() {
  payOpen.value = false
}
</script>

<template>
  <main class="screen has-dock">
    <RouterLink class="back" to="/"><i class="pi pi-arrow-left" aria-hidden="true" /> Mesas</RouterLink>
    <header class="top">
      <p class="kicker">Comanda aberta</p>
      <h1>{{ table?.name ?? 'Mesa' }}</h1>
    </header>

    <div v-if="comanda" class="comanda-layout">
      <div>
        <section>
          <p class="section-label">Na mesa</p>
          <p v-if="openSummary.length === 0" class="hint">Nada em aberto.</p>
          <ul v-else class="open-summary">
            <li v-for="row in openSummary" :key="row.name"><strong>{{ row.qty }}</strong> {{ row.name }}</li>
          </ul>
        </section>

        <ProductBoard :comanda-id="comanda.id" />

        <ItemList
          v-if="paidItems.length || cancelledItems.length"
          :open-items="[]"
          :paid-items="paidItems"
          :cancelled-items="cancelledItems"
        />

        <section v-if="shares.length" class="list">
          <p class="section-label">Quem pagou</p>
          <Card v-for="payment in shares" :key="payment.id">
            <template #content>
              <div class="row-between">
                <strong>{{ payment.payerName }}</strong>
                <span>{{ formatCents(payment.amountCents) }}</span>
              </div>
              <p class="movement">{{ methodLabel[payment.method] }}</p>
            </template>
          </Card>
        </section>
      </div>

      <footer class="dock">
        <div class="totals">
          <div class="total-line"><span>Consumo</span><span>{{ formatCents(consumption) }}</span></div>
          <div class="total-line"><span>Já pago</span><span>{{ formatCents(paid) }}</span></div>
          <div class="total-line strong"><span>Em aberto</span><span class="amount">{{ formatCents(due) }}</span></div>
        </div>
        <div class="actions">
          <Button label="Conta" icon="pi pi-receipt" @click="noteOpen = true" />
        </div>
      </footer>
    </div>
  </main>

  <PaySheet v-if="payOpen && comanda" :comanda-id="comanda.id" @close="payOpen = false" @done="onPaid" />
  <Dialog
    :visible="noteOpen && noteComanda !== null"
    modal
    header="Conta"
    :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
    @update:visible="(open: boolean) => { if (!open) closeNote() }"
  >
    <BillNote v-if="noteComanda" :comanda="noteComanda" />
    <template #footer>
      <Button class="no-print" label="Imprimir" icon="pi pi-print" severity="secondary" outlined @click="printNote" />
      <Button v-if="comanda && due > 0" class="no-print" label="Pagar" icon="pi pi-wallet" @click="payFromNote" />
      <Button v-else-if="comanda && due === 0" class="no-print" label="Fechar mesa" icon="pi pi-check" :disabled="bar.busy" @click="liberar" />
    </template>
  </Dialog>
</template>
