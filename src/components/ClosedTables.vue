<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import Panel from 'primevue/panel'
import SelectButton from 'primevue/selectbutton'
import { useBarStore } from '../stores/bar'
import { formatCents, periodBounds } from '../money'
import type { Comanda } from '../types'
import TableCard from './TableCard.vue'

type HistoryKind = 'day' | 'month' | 'year'

const bar = useBarStore()
const router = useRouter()
const kind = ref<HistoryKind>('day')
const anchor = ref(new Date())
const kinds = [
  { label: 'Dia', value: 'day' },
  { label: 'Mês', value: 'month' },
  { label: 'Ano', value: 'year' },
]

const pickerView = computed(() => (kind.value === 'month' ? 'month' : kind.value === 'year' ? 'year' : 'date'))
const dateFormat = computed(() => (kind.value === 'month' ? 'mm/yy' : kind.value === 'year' ? 'yy' : 'dd/mm/yy'))
const bounds = computed(() => periodBounds(kind.value, anchor.value))

const closed = computed(() =>
  bar.comandas
    .filter((comanda) => comanda.status === 'closed' && comanda.closedAt !== null)
    .filter((comanda) => {
      const at = comanda.closedAt ?? 0
      return at >= bounds.value.start && at < bounds.value.end
    })
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)),
)

const totalCents = computed(() => closed.value.reduce((sum, comanda) => sum + bar.consumptionOf(comanda.id), 0))

const groups = computed(() => {
  if (kind.value === 'day') return []
  const buckets = new Map<string, { label: string; rows: Comanda[] }>()
  for (const comanda of closed.value) {
    const at = new Date(comanda.closedAt ?? 0)
    const key = kind.value === 'year' ? `${at.getFullYear()}-${at.getMonth()}` : `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
    const label =
      kind.value === 'year'
        ? new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(at)
        : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).format(at).replace('.', '')
    const bucket = buckets.get(key)
    if (bucket) bucket.rows.push(comanda)
    else buckets.set(key, { label, rows: [comanda] })
  }
  return [...buckets.values()]
})

function countLabel(count: number) {
  return count === 1 ? '1 mesa' : `${count} mesas`
}

function itemQty(comandaId: string) {
  return bar.items
    .filter((item) => item.comandaId === comandaId && item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.qty, 0)
}

function whenLabel(at: number) {
  const date = new Date(at)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function groupCents(rows: Comanda[]) {
  return rows.reduce((sum, comanda) => sum + bar.consumptionOf(comanda.id), 0)
}

function openBill(comandaId: string) {
  void router.push({ name: 'conta', params: { comandaId } })
}
</script>

<template>
  <Panel toggleable collapsed class="sales-panel closed-block">
    <template #togglebutton="{ collapsed, toggleCallback }">
      <button type="button" class="sales-summary" :aria-expanded="!collapsed" @click="toggleCallback($event)">
        <span>Fechadas</span>
        <strong>{{ countLabel(closed.length) }}</strong>
        <i :class="collapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'" aria-hidden="true" />
      </button>
    </template>

    <div class="stack closed-tools">
      <SelectButton v-model="kind" class="mode-switch" :options="kinds" optionLabel="label" optionValue="value" :allowEmpty="false" />
      <DatePicker v-model="anchor" :view="pickerView" :dateFormat="dateFormat" :manualInput="false" showIcon fluid iconDisplay="input" />
    </div>

    <div class="closed-total">
      <span>{{ countLabel(closed.length) }}</span>
      <strong>{{ formatCents(totalCents) }}</strong>
    </div>

    <Message v-if="closed.length === 0" severity="secondary" :closable="false" icon="pi pi-history">
      Nenhuma mesa fechada nesse período.
    </Message>

    <div v-else-if="kind === 'day'" class="grid-tables">
      <TableCard
        v-for="comanda in closed"
        :key="comanda.id"
        closed
        :name="comanda.tableName"
        :due-cents="bar.consumptionOf(comanda.id)"
        :item-qty="itemQty(comanda.id)"
        :when="whenLabel(comanda.closedAt ?? 0)"
        @click="openBill(comanda.id)"
      />
    </div>

    <div v-else class="stack">
      <section v-for="group in groups" :key="group.label">
        <p class="section-label">{{ group.label }} · {{ countLabel(group.rows.length) }} · {{ formatCents(groupCents(group.rows)) }}</p>
        <div class="grid-tables">
          <TableCard
            v-for="comanda in group.rows"
            :key="comanda.id"
            closed
            :name="comanda.tableName"
            :due-cents="bar.consumptionOf(comanda.id)"
            :item-qty="itemQty(comanda.id)"
            :when="whenLabel(comanda.closedAt ?? 0)"
            @click="openBill(comanda.id)"
          />
        </div>
      </section>
    </div>
  </Panel>
</template>
