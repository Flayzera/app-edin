<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DatePicker from 'primevue/datepicker'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Paginator from 'primevue/paginator'
import SelectButton from 'primevue/selectbutton'
import { useBarStore } from '../stores/bar'
import { formatCents, formatPeriod, formatTime, parseReais, periodBounds, type PeriodKind } from '../money'
import { methodLabel } from '../labels'
import DebtList from '../components/DebtList.vue'
import ScreenHeader from '../components/ScreenHeader.vue'

const bar = useBarStore()
const router = useRouter()
const kind = ref<PeriodKind>('day')
const anchor = ref(new Date())
const openingText = ref('')
const dropText = ref('')
const dropNote = ref('')
const dropping = ref(false)
const pageSize = 10
const first = ref(0)
const openId = ref<string | null>(null)
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

function paymentLines(itemIds: string[]) {
  return itemIds.flatMap((id) => {
    const item = bar.items.find((row) => row.id === id)
    return item ? [`${item.qty} × ${item.name}`] : []
  })
}

const rows = computed(() => {
  const payments = bar.payments
    .filter((payment) => payment.method !== 'fiado' && payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end)
    .map((payment) => {
      const who = payment.payerName.trim()
      const where = bar.nameForComanda(payment.comandaId)
      const money = formatCents(payment.amountCents)
      const method = payment.method === 'cash' ? 'em dinheiro' : payment.method === 'pix' ? 'no Pix' : 'no cartão'
      const lines = paymentLines(payment.itemIds)
      const summaryName = payment.debtId ? `Fiado de ${who}` : who || (lines.length ? 'Itens' : 'Valor')
      let story = who
        ? `${who} pagou ${money} ${method} na mesa ${where}.`
        : `Entrou ${money} ${method} na mesa ${where}.`
      if (payment.debtId) story = `${who} pagou ${money} ${method} de um fiado da mesa ${where}.`
      else if (lines.length === 0) story = story.replace(/\.$/, ', sem marcar os itens.')
      return {
        id: payment.id,
        at: payment.createdAt,
        title: where,
        amount: money,
        summary: `${formatTime(payment.createdAt)} · ${methodLabel[payment.method]} · ${summaryName}`,
        story,
        lines,
      }
    })
  const sangrias = bar.drops
    .filter((drop) => drop.createdAt >= bounds.value.start && drop.createdAt < bounds.value.end)
    .map((drop) => ({
      id: drop.id,
      at: drop.createdAt,
      title: 'Sangria',
      amount: formatCents(drop.amountCents),
      summary: `${formatTime(drop.createdAt)}${drop.note ? ` · ${drop.note}` : ''}`,
      story: drop.note
        ? `Saiu ${formatCents(drop.amountCents)} da gaveta. Motivo: ${drop.note}.`
        : `Saiu ${formatCents(drop.amountCents)} da gaveta.`,
      lines: [] as string[],
    }))
  return [...payments, ...sangrias].sort((a, b) => b.at - a.at)
})
const pageRows = computed(() => rows.value.slice(first.value, first.value + pageSize))

watch(
  () => `${bounds.value.start}-${bounds.value.end}`,
  () => {
    first.value = 0
    openId.value = null
  },
)
watch(
  () => rows.value.length,
  (count) => {
    if (first.value > 0 && first.value >= count) {
      first.value = Math.max(0, Math.floor((Math.max(count, 1) - 1) / pageSize) * pageSize)
    }
  },
)

const cash = computed(() => bar.payments.filter((payment) => payment.method === 'cash' && payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end).reduce((sum, payment) => sum + payment.amountCents, 0))
const pix = computed(() => bar.payments.filter((payment) => payment.method === 'pix' && payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end).reduce((sum, payment) => sum + payment.amountCents, 0))
const card = computed(() => bar.payments.filter((payment) => payment.method === 'card' && payment.createdAt >= bounds.value.start && payment.createdAt < bounds.value.end).reduce((sum, payment) => sum + payment.amountCents, 0))

function toggleRow(id: string) {
  openId.value = openId.value === id ? null : id
}

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
  const ok = await bar.ask('Fechar caixa', '', 'Fechar', {
    lines: [
      { label: 'Na gaveta', value: formatCents(position.value.drawer), strong: true },
      { label: 'Dinheiro', value: formatCents(position.value.cash) },
      { label: 'Pix', value: formatCents(position.value.pix) },
      { label: 'Cartão', value: formatCents(position.value.card) },
      { label: 'Sangrias', value: formatCents(position.value.sangria) },
    ],
    note: 'Um backup com a data e a hora vai baixar neste celular.',
  })
  if (ok) await bar.closeCashier()
}
</script>

<template>
  <main class="screen">
    <ScreenHeader eyebrow="Movimento" title="Caixa" :subtitle="`${periodLabel}. Vendas do período e o dinheiro da gaveta.`">
      <Button label="Relatório" icon="pi pi-chart-bar" severity="secondary" outlined @click="router.push({ name: 'relatorio' })" />
    </ScreenHeader>

    <div class="caixa-layout">
    <div>
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
    <DebtList />
    </div>

    <div>
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
      <Card v-for="row in pageRows" :key="row.id">
        <template #content>
          <button type="button" class="cash-toggle" :aria-expanded="openId === row.id" @click="toggleRow(row.id)">
            <span>
              <strong>{{ row.title }}</strong>
              <span class="movement">{{ row.summary }}</span>
            </span>
            <span>{{ row.amount }}</span>
            <i :class="openId === row.id ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" aria-hidden="true" />
          </button>
          <div v-if="openId === row.id" class="cash-detail">
            <p>{{ row.story }}</p>
            <p v-for="(line, index) in row.lines" :key="`${row.id}-${index}`" class="item-line">{{ line }}</p>
          </div>
        </template>
      </Card>
    </div>
    <Paginator
      v-model:first="first"
      class="pager"
      :rows="pageSize"
      :totalRecords="rows.length"
      :alwaysShow="true"
      template="PrevPageLink CurrentPageReport NextPageLink"
      currentPageReportTemplate="{first}–{last} de {totalRecords}"
    />
    </div>
    </div>
  </main>
</template>
