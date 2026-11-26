<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBarStore } from '../stores/bar'
import { formatCents } from '../money'
import { methodLabel } from '../labels'
import Button from 'primevue/button'
import Card from 'primevue/card'
import ItemList from '../components/ItemList.vue'
import PaySheet from '../components/PaySheet.vue'
import ProductPicker from '../components/ProductPicker.vue'
import type { ComandaItem } from '../types'

const route = useRoute()
const router = useRouter()
const bar = useBarStore()
const pickerOpen = ref(false)
const payOpen = ref(false)

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
    ? bar.payments.filter((payment) => payment.comandaId === comanda.value?.id && payment.payerName)
    : [],
)

async function ensure() {
  if (!table.value) {
    await router.replace('/')
    return
  }
  await bar.ensureComanda(table.value.id)
}

watch(tableId, () => {
  pickerOpen.value = false
  payOpen.value = false
  void ensure()
}, { immediate: true })

watch(comanda, (current, previous) => {
  if (previous && !current) {
    pickerOpen.value = false
    payOpen.value = false
    void router.replace('/')
  }
})

function itemById(id: string): ComandaItem | undefined {
  return openItems.value.find((item) => item.id === id)
}

async function increase(id: string) {
  const item = itemById(id)
  if (!item) return
  await bar.changeItemQty(item.id, item.qty + 1)
}

async function decrease(id: string) {
  const item = itemById(id)
  if (!item) return
  if (item.qty > 1) {
    await bar.changeItemQty(item.id, item.qty - 1)
    return
  }
  const product = bar.productById(item.productId)
  const body = product
    ? `Isso devolve ${item.qty} ao estoque de ${item.name}.`
    : `Tirar ${item.name} da comanda?`
  const ok = await bar.ask('Tirar da comanda', body, 'Tirar')
  if (ok) await bar.changeItemQty(item.id, 0)
}

async function liberar() {
  if (!comanda.value) return
  const ok = await bar.closeComanda(comanda.value.id)
  if (ok) await router.replace('/')
}

async function onPaid(result: 'partial' | 'closed') {
  payOpen.value = false
  if (result === 'closed') await router.replace('/')
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
        <ItemList
          :open-items="openItems"
          :paid-items="paidItems"
          :cancelled-items="cancelledItems"
          @increase="increase"
          @decrease="decrease"
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
          <Button label="Adicionar" icon="pi pi-plus" severity="secondary" outlined @click="pickerOpen = true" />
          <Button v-if="due > 0" label="Pagar" icon="pi pi-wallet" @click="payOpen = true" />
          <Button v-else label="Fechar mesa" icon="pi pi-check" :disabled="bar.busy" @click="liberar" />
        </div>
      </footer>
    </div>
  </main>

  <ProductPicker v-if="pickerOpen && comanda" :comanda-id="comanda.id" @close="pickerOpen = false" />
  <PaySheet v-if="payOpen && comanda" :comanda-id="comanda.id" @close="payOpen = false" @done="onPaid" />
</template>
