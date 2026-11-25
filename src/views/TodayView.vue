<script setup lang="ts">
import { computed, ref } from 'vue'
import Card from 'primevue/card'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { useBarStore } from '../stores/bar'
import { formatCents, formatPeriod, formatTime, periodBounds, type PeriodKind } from '../money'
import { methodLabel } from '../labels'
import ScreenHeader from '../components/ScreenHeader.vue'

const bar = useBarStore()
const kind = ref<PeriodKind>('day')
const anchor = ref(new Date())
const kinds = [
  { label: 'Dia', value: 'day' },
  { label: 'Semana', value: 'week' },
  { label: 'Mês', value: 'month' },
  { label: 'Ano', value: 'year' },
]

const pickerView = computed(() => (kind.value === 'month' ? 'month' : kind.value === 'year' ? 'year' : 'date'))
const dateFormat = computed(() => (kind.value === 'month' ? 'mm/yy' : kind.value === 'year' ? 'yy' : 'dd/mm/yy'))
const bounds = computed(() => periodBounds(kind.value, anchor.value))
const periodLabel = computed(() => formatPeriod(kind.value, anchor.value))
const rows = computed(() =>
  bar.payments
    .filter((payment) => payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end)
    .sort((a, b) => b.createdAt - a.createdAt),
)
const cash = computed(() => rows.value.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amountCents, 0))
const pix = computed(() => rows.value.filter((payment) => payment.method === 'pix').reduce((sum, payment) => sum + payment.amountCents, 0))
const title = computed(() => (kind.value === 'day' ? 'Dia' : kind.value === 'week' ? 'Semana' : kind.value === 'month' ? 'Mês' : 'Ano'))
</script>

<template>
  <main class="screen">
    <ScreenHeader eyebrow="Caixa" :title="title" :subtitle="`${periodLabel}. O que já foi pago.`" />

    <div class="stack">
      <SelectButton v-model="kind" class="mode-switch" :options="kinds" optionLabel="label" optionValue="value" :allowEmpty="false" />
      <DatePicker v-model="anchor" :view="pickerView" :dateFormat="dateFormat" :manualInput="false" showIcon fluid iconDisplay="input" />
    </div>

    <section class="stats">
      <Card>
        <template #content>
          <span class="muted">Dinheiro</span>
          <strong class="stat-value">{{ formatCents(cash) }}</strong>
        </template>
      </Card>
      <Card>
        <template #content>
          <span class="muted">Pix</span>
          <strong class="stat-value">{{ formatCents(pix) }}</strong>
        </template>
      </Card>
      <Card class="stat-total">
        <template #content>
          <span>Total</span>
          <strong class="stat-value">{{ formatCents(cash + pix) }}</strong>
        </template>
      </Card>
    </section>

    <Message v-if="rows.length === 0" severity="secondary" :closable="false" icon="pi pi-wallet">
      Nada pago nesse período.
    </Message>
    <div v-else class="list" style="margin-top: 1rem">
      <Card v-for="payment in rows" :key="payment.id">
        <template #content>
          <div class="row-between">
            <strong>{{ bar.nameForComanda(payment.comandaId) }}</strong>
            <span>{{ formatCents(payment.amountCents) }}</span>
          </div>
          <p class="movement">
            {{ formatTime(payment.createdAt) }} · {{ methodLabel[payment.method] }} ·
            {{ payment.payerName || (payment.itemIds.length ? 'Itens' : 'Valor') }}
          </p>
        </template>
      </Card>
    </div>
  </main>
</template>
