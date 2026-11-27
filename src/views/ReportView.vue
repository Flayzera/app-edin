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
import { formatCents, formatPeriod, parseReais } from '../money'
import { buildReport, previousAnchor, type ReportKind } from '../report'
import ScreenHeader from '../components/ScreenHeader.vue'

const bar = useBarStore()
const kind = ref<ReportKind>('day')
const anchor = ref(new Date())
const editingGoal = ref(false)
const goalText = ref('')
const kinds = [
  { label: 'Dia', value: 'day' },
  { label: 'Semana', value: 'week' },
  { label: 'Mês', value: 'month' },
]

const pickerView = computed(() => (kind.value === 'month' ? 'month' : 'date'))
const dateFormat = computed(() => (kind.value === 'month' ? 'mm/yy' : 'dd/mm/yy'))
const periodLabel = computed(() => formatPeriod(kind.value, anchor.value))

const report = computed(() =>
  buildReport(kind.value, anchor.value, {
    payments: bar.payments,
    items: bar.items,
    comandas: bar.comandas,
    drops: bar.drops,
    movements: bar.movements,
    products: bar.products,
  }),
)
const previous = computed(() =>
  buildReport(kind.value, previousAnchor(kind.value, anchor.value), {
    payments: bar.payments,
    items: bar.items,
    comandas: bar.comandas,
    drops: bar.drops,
    movements: bar.movements,
    products: bar.products,
  }).receivedCents,
)
const openFiado = computed(() => bar.openDebts.reduce((sum, debt) => sum + debt.remainingCents, 0))
const fiadoPeople = computed(() => {
  const grouped = new Map<string, { name: string; cents: number; count: number }>()
  for (const debt of bar.openDebts) {
    const key = debt.personName.trim().toLocaleLowerCase('pt-BR')
    const row = grouped.get(key) ?? { name: debt.personName.trim(), cents: 0, count: 0 }
    row.cents += debt.remainingCents
    row.count += 1
    grouped.set(key, row)
  }
  return [...grouped.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, 'pt-BR'))
})
const monthName = computed(() => formatPeriod('month', anchor.value))
const monthReceived = computed(() =>
  kind.value === 'month'
    ? report.value.receivedCents
    : buildReport('month', anchor.value, {
        payments: bar.payments,
        items: bar.items,
        comandas: bar.comandas,
        drops: bar.drops,
        movements: bar.movements,
        products: bar.products,
      }).receivedCents,
)
const goalLeft = computed(() => (bar.monthGoalCents ?? 0) - monthReceived.value)
const goalWidth = computed(() => {
  if (!bar.monthGoalCents) return 0
  return Math.min(100, Math.round((monthReceived.value / bar.monthGoalCents) * 100))
})
const maxDay = computed(() => Math.max(1, ...report.value.days.map((day) => day.cents)))
const busiest = computed(() => {
  const days = report.value.days.filter((day) => day.cents > 0)
  if (days.length === 0) return null
  return days.reduce((best, day) => (day.cents > best.cents ? day : best))
})
const strongDays = computed(() =>
  [...report.value.days].filter((day) => day.cents > 0).sort((a, b) => b.cents - a.cents || b.at - a.at).slice(0, 5),
)
const idlePreview = computed(() => report.value.idleNames.slice(0, 8))

const comparison = computed(() => {
  const current = report.value.receivedCents
  const before = previous.value
  const against = kind.value === 'day' ? 'ontem' : kind.value === 'week' ? 'a semana anterior' : 'o mês anterior'
  if (before === 0 && current === 0) return 'Sem recebimento neste período nem no anterior.'
  if (before === 0) return `Não houve recebimento ${kind.value === 'day' ? 'ontem' : 'no período anterior'}.`
  if (current === before) return `Igual a ${against}.`
  const diff = Math.abs(current - before)
  return current > before ? `${formatCents(diff)} a mais que ${against}.` : `${formatCents(diff)} a menos que ${against}.`
})

function tablesLabel(count: number) {
  return count === 1 ? '1 mesa fechada' : `${count} mesas fechadas`
}

function startGoal() {
  const cents = bar.monthGoalCents
  goalText.value = cents ? (cents / 100).toFixed(2).replace('.', ',') : ''
  editingGoal.value = true
}

async function saveGoal() {
  const cents = parseReais(goalText.value)
  if (cents === null || cents < 1) {
    bar.flash('Digite a meta com até duas casas. Ex.: 8000,00')
    return
  }
  const ok = await bar.setMonthGoal(cents)
  if (ok) editingGoal.value = false
}

async function clearGoal() {
  const ok = await bar.setMonthGoal(null)
  if (ok) editingGoal.value = false
}
</script>

<template>
  <main class="screen">
    <ScreenHeader eyebrow="Dono" title="Relatório" :subtitle="`${periodLabel}. O que entrou de verdade no período.`" />

    <div class="stack">
      <SelectButton v-model="kind" class="mode-switch" :options="kinds" optionLabel="label" optionValue="value" :allowEmpty="false" />
      <DatePicker v-model="anchor" :view="pickerView" :dateFormat="dateFormat" :manualInput="false" showIcon fluid iconDisplay="input" />
    </div>

    <div class="report-layout">
      <div>
        <section class="stats">
          <Card class="stat-total">
            <template #content>
              <span>Entrou</span>
              <strong class="stat-value">{{ formatCents(report.receivedCents) }}</strong>
            </template>
          </Card>
          <Card>
            <template #content>
              <span class="muted">Dinheiro</span>
              <strong class="stat-value">{{ formatCents(report.cash) }}</strong>
            </template>
          </Card>
          <Card>
            <template #content>
              <span class="muted">Pix</span>
              <strong class="stat-value">{{ formatCents(report.pix) }}</strong>
            </template>
          </Card>
          <Card>
            <template #content>
              <span class="muted">Cartão</span>
              <strong class="stat-value">{{ formatCents(report.card) }}</strong>
            </template>
          </Card>
        </section>
        <p class="hint">{{ comparison }} Fiado anotado só entra aqui quando a pessoa paga. A gaveta do turno continua no Caixa.</p>

        <p class="section-label">Meta de {{ monthName }}</p>
        <Card>
          <template #content>
            <template v-if="editingGoal || !bar.monthGoalCents">
              <p class="hint">Quanto você quer que entre neste mês, em dinheiro, Pix e cartão.</p>
              <FloatLabel variant="on" class="field" style="margin-top: 0.85rem">
                <InputText id="month-goal" v-model="goalText" inputmode="decimal" autocomplete="off" />
                <label for="month-goal">Meta do mês</label>
              </FloatLabel>
              <Button v-if="!bar.monthGoalCents" class="wide-btn" style="margin-top: 0.85rem" label="Salvar" :disabled="bar.busy" @click="saveGoal" />
              <div v-else class="actions" style="margin-top: 0.85rem">
                <Button label="Cancelar" severity="secondary" outlined @click="editingGoal = false" />
                <Button label="Salvar" :disabled="bar.busy" @click="saveGoal" />
              </div>
              <Button v-if="bar.monthGoalCents" class="wide-btn" style="margin-top: 0.65rem" label="Tirar meta" severity="secondary" text :disabled="bar.busy" @click="clearGoal" />
            </template>
            <template v-else>
              <div class="row-between">
                <strong>{{ formatCents(monthReceived) }} de {{ formatCents(bar.monthGoalCents) }}</strong>
                <Button label="Alterar" text @click="startGoal" />
              </div>
              <span class="day-track goal-track"><span :style="{ width: `${goalWidth}%` }" /></span>
              <p class="hint">{{ goalLeft > 0 ? `Faltam ${formatCents(goalLeft)}.` : goalLeft === 0 ? 'Meta batida.' : `Passou ${formatCents(-goalLeft)} da meta.` }}</p>
            </template>
          </template>
        </Card>

        <p class="section-label">Fiado</p>
        <div class="stats">
          <Card>
            <template #content>
              <span class="muted">Anotado</span>
              <strong class="stat-value">{{ formatCents(report.fiadoNoted) }}</strong>
            </template>
          </Card>
          <Card>
            <template #content>
              <span class="muted">Recebido</span>
              <strong class="stat-value">{{ formatCents(report.fiadoReceived) }}</strong>
            </template>
          </Card>
          <Card class="stat-total">
            <template #content>
              <span>Em aberto agora</span>
              <strong class="stat-value">{{ formatCents(openFiado) }}</strong>
            </template>
          </Card>
        </div>
        <p class="section-label">Quem deve</p>
        <p class="hint">Quem ainda está com fiado em aberto. Vale agora, em qualquer período que você escolher.</p>
        <Message v-if="fiadoPeople.length === 0" severity="secondary" :closable="false" icon="pi pi-book">
          Ninguém está devendo.
        </Message>
        <div v-else class="sheet-table">
          <div class="sheet-head cols-3">
            <span>Pessoa</span>
            <span>Contas</span>
            <span>Valor</span>
          </div>
          <div v-for="person in fiadoPeople" :key="person.name" class="sheet-row cols-3">
            <strong>{{ person.name }}</strong>
            <span>{{ person.count }}</span>
            <strong class="sheet-money">{{ formatCents(person.cents) }}</strong>
          </div>
        </div>

        <p class="section-label">Mesas</p>
        <Card>
          <template #content>
            <div class="total-line"><span>{{ tablesLabel(report.tables) }}</span><span>{{ formatCents(report.consumption) }}</span></div>
            <div class="total-line"><span>Média por mesa</span><strong>{{ formatCents(report.ticket) }}</strong></div>
            <div class="total-line"><span>Sangrias</span><span>{{ formatCents(report.sangria) }}</span></div>
            <div class="total-line">
              <span>Voltou ao estoque</span>
              <span>{{ report.returnedQty === 1 ? '1 un' : `${report.returnedQty} un` }}</span>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <template v-if="kind === 'week'">
          <p class="section-label">Por dia</p>
          <div class="day-bars">
            <div v-for="day in report.days" :key="day.at" class="day-bar">
              <span>{{ day.label }}</span>
              <span class="day-track"><span :style="{ width: `${Math.round((day.cents / maxDay) * 100)}%` }" /></span>
              <strong>{{ formatCents(day.cents) }}</strong>
            </div>
          </div>
        </template>

        <template v-else-if="kind === 'month'">
          <p class="section-label">Dias com recebimento</p>
          <Message v-if="report.busyDays === 0" severity="secondary" :closable="false" icon="pi pi-calendar">
            Nenhum dia com dinheiro, Pix ou cartão.
          </Message>
          <Card v-else>
            <template #content>
              <div class="total-line"><span>Dias com movimento</span><strong>{{ report.busyDays }}</strong></div>
              <div v-if="busiest && busiest.cents > 0" class="total-line">
                <span>Dia mais forte</span>
                <strong>{{ busiest.label }} · {{ formatCents(busiest.cents) }}</strong>
              </div>
              <div v-for="day in strongDays" :key="day.at" class="total-line">
                <span>{{ day.label }}</span>
                <span>{{ formatCents(day.cents) }}</span>
              </div>
            </template>
          </Card>
        </template>

        <p class="section-label">O que saiu</p>
        <Message v-if="report.products.length === 0" severity="secondary" :closable="false" icon="pi pi-box">
          Nenhum item pago nesse período.
        </Message>
        <div v-else class="list">
          <Card v-for="product in report.products" :key="product.name">
            <template #content>
              <div class="row-between">
                <strong>{{ product.name }}</strong>
                <span>{{ formatCents(product.cents) }}</span>
              </div>
              <p class="movement">{{ product.qty === 1 ? '1 un' : `${product.qty} un` }}</p>
            </template>
          </Card>
        </div>
        <p v-if="report.products.length" class="hint">Valor do que foi consumido, inclusive fiado.</p>

        <template v-if="kind === 'month' && idlePreview.length">
          <p class="section-label">Sem saída no mês</p>
          <p class="hint">{{ idlePreview.join(', ') }}{{ report.idleNames.length > idlePreview.length ? ` e mais ${report.idleNames.length - idlePreview.length}` : '' }}.</p>
        </template>

        <template v-if="bar.lowStockProducts.length">
          <p class="section-label">Estoque baixo agora</p>
          <div class="list">
            <Card v-for="product in bar.lowStockProducts" :key="product.id" class="low-card">
              <template #content>
                <div class="row-between">
                  <strong>{{ product.name }}</strong>
                  <span>{{ product.stockQty }} un</span>
                </div>
              </template>
            </Card>
          </div>
        </template>
      </div>
    </div>
  </main>
</template>
