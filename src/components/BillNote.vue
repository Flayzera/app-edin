<script setup lang="ts">
import { computed } from 'vue'
import { useBarStore } from '../stores/bar'
import { formatCents, formatDateTime } from '../money'
import { methodLabel } from '../labels'
import type { Comanda } from '../types'

const props = defineProps<{ comanda: Comanda }>()
const bar = useBarStore()

const lines = computed(() =>
  bar.items
    .filter((item) => item.comandaId === props.comanda.id && item.status !== 'cancelled')
    .sort((a, b) => a.createdAt - b.createdAt),
)
const payments = computed(() =>
  bar.payments
    .filter((payment) => payment.comandaId === props.comanda.id && !payment.debtId)
    .sort((a, b) => a.createdAt - b.createdAt),
)
const consumption = computed(() => bar.consumptionOf(props.comanda.id))
const paid = computed(() => bar.paidOf(props.comanda.id))
const due = computed(() => Math.max(0, bar.dueOf(props.comanda.id)))
const stay = computed(() => {
  const end = props.comanda.closedAt ?? Date.now()
  const totalSeconds = Math.max(0, Math.floor((end - props.comanda.openedAt) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const part = (value: number) => String(value).padStart(2, '0')
  return `${part(hours)}:${part(minutes)}:${part(seconds)}`
})

function amount(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <article class="bill-note">
    <header>
      <p class="bill-brand">Pires Bar</p>
      <p class="bill-kind">Conferência de conta</p>
      <p class="bill-flag">Sem valor fiscal</p>
    </header>

    <dl class="bill-meta">
      <div><dt>Mesa</dt><dd>{{ comanda.tableName }}</dd></div>
      <div><dt>Abertura</dt><dd>{{ formatDateTime(comanda.openedAt) }}</dd></div>
      <div v-if="comanda.closedAt"><dt>Fechamento</dt><dd>{{ formatDateTime(comanda.closedAt) }}</dd></div>
      <div><dt>Permanência</dt><dd>{{ stay }}</dd></div>
    </dl>

    <table>
      <thead>
        <tr>
          <th>Qtd</th>
          <th>Descrição</th>
          <th>Unit.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="lines.length === 0">
          <td class="bill-empty" colspan="4">Nada lançado</td>
        </tr>
        <tr v-for="item in lines" :key="item.id">
          <td>{{ item.qty }}</td>
          <td>{{ item.name }}</td>
          <td>{{ amount(item.unitPriceCents) }}</td>
          <td>{{ amount(item.unitPriceCents * item.qty) }}</td>
        </tr>
      </tbody>
    </table>

    <dl class="bill-sums">
      <div><dt>Subtotal</dt><dd>{{ formatCents(consumption) }}</dd></div>
    </dl>

    <template v-if="payments.length">
      <p class="bill-section">Pagamentos</p>
      <dl class="bill-sums">
        <div v-for="payment in payments" :key="payment.id">
          <dt>{{ payment.payerName || 'Pagamento' }} · {{ methodLabel[payment.method] }}</dt>
          <dd>{{ formatCents(payment.amountCents) }}</dd>
        </div>
      </dl>
    </template>

    <dl class="bill-sums bill-total">
      <div><dt>Total</dt><dd>{{ formatCents(consumption) }}</dd></div>
      <div><dt>Pago</dt><dd>{{ formatCents(paid) }}</dd></div>
      <div class="bill-due">
        <dt>A pagar</dt>
        <dd>{{ formatCents(due) }}</dd>
      </div>
    </dl>

    <footer>
      <p>Obrigado pela preferência</p>
      <p>Documento sem valor fiscal. Não substitui cupom fiscal.</p>
    </footer>
  </article>
</template>
