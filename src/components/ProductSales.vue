<script setup lang="ts">
import { computed } from 'vue'
import Panel from 'primevue/panel'
import { useBarStore } from '../stores/bar'
import { productSales } from '../sales'
import { formatCents, formatTime, startOfToday } from '../money'
import { methodLabel } from '../labels'

const props = defineProps<{
  productId: string
  day: Date
}>()

const bar = useBarStore()
const lines = computed(() => productSales(props.productId, props.day, bar.items, bar.payments, bar.comandas))
const totalQty = computed(() => lines.value.reduce((sum, line) => sum + line.qty, 0))
const totalCents = computed(() => lines.value.reduce((sum, line) => sum + line.amountCents, 0))
const openQty = computed(() =>
  bar.items
    .filter((item) => item.productId === props.productId && item.status === 'open')
    .reduce((sum, item) => sum + item.qty, 0),
)
const showOpen = computed(() => openQty.value > 0 && startOfToday(props.day) === startOfToday())

function methodText(method: (typeof lines.value)[number]['method']) {
  if (method === 'mixed') return 'Misto'
  if (method) return methodLabel[method]
  return 'Valor'
}
</script>

<template>
  <Panel toggleable collapsed class="sales-panel">
    <template #togglebutton="{ collapsed, toggleCallback }">
      <button type="button" class="sales-summary" :aria-expanded="!collapsed" @click="toggleCallback($event)">
        <span>{{ totalQty === 1 ? '1 un vendida' : `${totalQty} un vendidas` }}</span>
        <strong v-if="totalCents">{{ formatCents(totalCents) }}</strong>
        <i :class="collapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'" aria-hidden="true" />
      </button>
    </template>
    <p v-if="showOpen" class="hint">{{ openQty === 1 ? '1 un ainda na mesa, sem pagamento.' : `${openQty} un ainda na mesa, sem pagamento.` }}</p>
    <p v-if="lines.length === 0" class="hint">Nenhuma venda paga neste dia.</p>
    <div v-else class="sale-scroll">
      <div v-for="line in lines" :key="line.id" class="sale-line">
        <span>{{ formatTime(line.at) }}</span>
        <span>{{ line.tableName }} · {{ line.qty }} un · {{ methodText(line.method) }}</span>
        <strong>{{ formatCents(line.amountCents) }}</strong>
      </div>
    </div>
  </Panel>
</template>
