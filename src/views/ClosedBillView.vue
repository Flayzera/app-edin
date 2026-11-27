<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Card from 'primevue/card'
import { useBarStore } from '../stores/bar'
import { formatCents, formatDateTime } from '../money'
import { methodLabel } from '../labels'
import ItemList from '../components/ItemList.vue'

const route = useRoute()
const router = useRouter()
const bar = useBarStore()

const comandaId = computed(() => String(route.params.comandaId))
const comanda = computed(() => bar.comandas.find((row) => row.id === comandaId.value) ?? null)
const paidItems = computed(() => (comanda.value ? bar.itemsOf(comanda.value.id, 'paid') : []))
const cancelledItems = computed(() => (comanda.value ? bar.itemsOf(comanda.value.id, 'cancelled') : []))
const shares = computed(() =>
  comanda.value
    ? bar.payments.filter((payment) => payment.comandaId === comanda.value?.id && payment.payerName && !payment.debtId)
    : [],
)

watch(
  comanda,
  (current) => {
    if (!current) {
      void router.replace('/')
      return
    }
    if (current.status === 'open') {
      void router.replace({ name: 'comanda', params: { tableId: current.tableId } })
    }
  },
  { immediate: true },
)
</script>

<template>
  <main v-if="comanda && comanda.status === 'closed'" class="screen has-dock">
    <RouterLink class="back" to="/"><i class="pi pi-arrow-left" aria-hidden="true" /> Mesas</RouterLink>
    <header class="top">
      <p class="kicker">Mesa fechada</p>
      <h1>{{ comanda.tableName }}</h1>
      <p class="subtitle">{{ formatDateTime(comanda.closedAt ?? comanda.openedAt) }}</p>
    </header>

    <ItemList readonly :open-items="[]" :paid-items="paidItems" :cancelled-items="cancelledItems" />

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

    <footer class="dock">
      <div class="totals">
        <div class="total-line"><span>Consumo</span><span>{{ formatCents(bar.consumptionOf(comanda.id)) }}</span></div>
        <div class="total-line strong"><span>Pago</span><span class="amount">{{ formatCents(bar.paidOf(comanda.id)) }}</span></div>
      </div>
    </footer>
  </main>
</template>
