<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DatePicker from 'primevue/datepicker'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { useBarStore } from '../stores/bar'
import { formatCents, formatPeriod, formatTime, parseReais, periodBounds, type PeriodKind } from '../money'
import { methodLabel } from '../labels'
import ScreenHeader from '../components/ScreenHeader.vue'

const bar = useBarStore()
const kind = ref<PeriodKind>('day')
const anchor = ref(new Date())
const openingText = ref('')
const dropText = ref('')
const dropNote = ref('')
const dropping = ref(false)
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
const session = computed(() => bar.openSession)
const position = computed(() => (session.value ? bar.cashPosition(session.value) : null))

const rows = computed(() => {
  const payments = bar.payments
    .filter((payment) => payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end)
    .map((payment) => ({
      id: payment.id,
      at: payment.createdAt,
      title: bar.nameForComanda(payment.comandaId),
      amount: formatCents(payment.amountCents),
      detail: `${formatTime(payment.createdAt)} · ${methodLabel[payment.method]} · ${payment.payerName || (payment.itemIds.length ? 'Itens' : 'Valor')}`,
    }))
  const sangrias = bar.drops
    .filter((drop) => drop.createdAt >= bounds.value.start && drop.createdAt < bounds.value.end)
    .map((drop) => ({
      id: drop.id,
      at: drop.createdAt,
      title: 'Sangria',
      amount: formatCents(drop.amountCents),
      detail: `${formatTime(drop.createdAt)}${drop.note ? ` · ${drop.note}` : ''}`,
    }))
  return [...payments, ...sangrias].sort((a, b) => b.at - a.at)
})

const cash = computed(() => bar.payments.filter((payment) => payment.method === 'cash' && payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end).reduce((sum, payment) => sum + payment.amountCents, 0))
const pix = computed(() => bar.payments.filter((payment) => payment.method === 'pix' && payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end).reduce((sum, payment) => sum + payment.amountCents, 0))
const card = computed(() => bar.payments.filter((payment) => payment.method === 'card' && payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end).reduce((sum, payment) => sum + payment.amountCents, 0))

async function open() {
  const cents = openingText.value.trim() ? parseReais(openingText.value) : 0
  if (cents === null) {
    bar.flash('Digite o fundo com até duas casas. Ex.: 50,00')
    return
  }
  const ok = await bar.openCashier(cents)
  if (ok) openingText.value = ''
}

async function drop() {
  const cents = parseReais(dropText.value)
  if (cents === null || cents < 1) {
    bar.flash('Digite o valor da sangria. Ex.: 100,00')
    return
  }
  const ok = await bar.dropCash(cents, dropNote.value)
  if (!ok) return
  dropText.value = ''
  dropNote.value = ''
  dropping.value = false
}

async function close() {
  if (!position.value) return
  const ok = await bar.ask(
    'Fechar caixa',
    `Na gaveta deveria ter ${formatCents(position.value.drawer)}. Dinheiro ${formatCents(position.value.cash)}, Pix ${formatCents(position.value.pix)}, cartão ${formatCents(position.value.card)}. Sangrias ${formatCents(position.value.sangria)}.`,
    'Fechar',
  )
  if (ok) await bar.closeCashier()
}
</script>

<template>
  <main class="screen">
    <ScreenHeader eyebrow="Movimento" title="Caixa" :subtitle="`${periodLabel}. Vendas do período e o dinheiro da gaveta.`" />

    <Card v-if="session && position">
      <template #content>
        <div class="row-between">
          <strong>Caixa aberto</strong>
          <span class="muted">{{ formatTime(session.openedAt) }}</span>
        </div>
        <div class="totals" style="margin-top: 0.75rem">
          <div class="total-line"><span>Fundo</span><span>{{ formatCents(session.openingCents) }}</span></div>
          <div class="total-line"><span>Dinheiro</span><span>{{ formatCents(position.cash) }}</span></div>
          <div class="total-line"><span>Pix</span><span>{{ formatCents(position.pix) }}</span></div>
          <div class="total-line"><span>Cartão</span><span>{{ formatCents(position.card) }}</span></div>
          <div class="total-line"><span>Sangrias</span><span>{{ formatCents(position.sangria) }}</span></div>
          <div class="total-line strong"><span>Na gaveta</span><span class="amount">{{ formatCents(position.drawer) }}</span></div>
        </div>
        <p class="hint">Pix e cartão foram na maquininha. A gaveta soma o fundo com o dinheiro e desconta as sangrias.</p>
        <div v-if="dropping" class="stack" style="margin-top: 0.85rem">
          <FloatLabel variant="on" class="field">
            <InputText id="drop-amount" v-model="dropText" inputmode="decimal" autocomplete="off" />
            <label for="drop-amount">Valor da sangria</label>
          </FloatLabel>
          <FloatLabel variant="on" class="field">
            <InputText id="drop-note" v-model="dropNote" maxlength="80" autocomplete="off" />
            <label for="drop-note">Motivo</label>
          </FloatLabel>
          <div class="actions">
            <Button label="Cancelar" severity="secondary" outlined @click="dropping = false" />
            <Button label="Registrar" :disabled="bar.busy" @click="drop" />
          </div>
        </div>
        <div v-else class="actions" style="margin-top: 0.85rem">
          <Button label="Sangria" icon="pi pi-minus" severity="secondary" outlined @click="dropping = true" />
          <Button label="Fechar caixa" icon="pi pi-lock" severity="danger" :disabled="bar.busy" @click="close" />
        </div>
      </template>
    </Card>

    <Card v-else>
      <template #content>
        <strong>Caixa fechado</strong>
        <p class="hint">Informe o dinheiro que já está na gaveta. Pode ser zero.</p>
        <FloatLabel variant="on" class="field" style="margin-top: 0.85rem">
          <InputText id="opening-amount" v-model="openingText" inputmode="decimal" autocomplete="off" />
          <label for="opening-amount">Fundo de caixa</label>
        </FloatLabel>
        <Button class="wide-btn" style="margin-top: 0.85rem" label="Abrir caixa" icon="pi pi-lock-open" :disabled="bar.busy" @click="open" />
      </template>
    </Card>

    <div class="stack" style="margin-top: 1rem">
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
      <Card>
        <template #content>
          <span class="muted">Cartão</span>
          <strong class="stat-value">{{ formatCents(card) }}</strong>
        </template>
      </Card>
      <Card class="stat-total">
        <template #content>
          <span>Total</span>
          <strong class="stat-value">{{ formatCents(cash + pix + card) }}</strong>
        </template>
      </Card>
    </section>

    <Message v-if="rows.length === 0" severity="secondary" :closable="false" icon="pi pi-wallet">
      Nada nesse período.
    </Message>
    <div v-else class="list" style="margin-top: 1rem">
      <Card v-for="row in rows" :key="row.id">
        <template #content>
          <div class="row-between">
            <strong>{{ row.title }}</strong>
            <span>{{ row.amount }}</span>
          </div>
          <p class="movement">{{ row.detail }}</p>
        </template>
      </Card>
    </div>
  </main>
</template>
