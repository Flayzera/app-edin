<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useBarStore } from '../stores/bar'
import { formatCents, formatDateTime, parseReais } from '../money'
import type { PaymentMethod } from '../types'

const bar = useBarStore()
const receivingId = ref<string | null>(null)
const amountText = ref('')

function reais(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function start(id: string, remainingCents: number) {
  receivingId.value = id
  amountText.value = reais(remainingCents)
}

async function receive(method: Exclude<PaymentMethod, 'fiado'>) {
  if (!receivingId.value) return
  const cents = parseReais(amountText.value)
  if (cents === null) {
    bar.flash('Digite o valor com até duas casas. Ex.: 20,00')
    return
  }
  const ok = await bar.payDebt(receivingId.value, cents, method)
  if (ok) {
    receivingId.value = null
    amountText.value = ''
  }
}
</script>

<template>
  <section v-if="bar.openDebts.length" class="debt-list">
    <p class="section-label">A receber</p>
    <Message v-if="!bar.openSession" severity="warn" :closable="false">Abra o caixa antes de receber um fiado.</Message>
    <Card v-for="debt in bar.openDebts" :key="debt.id">
      <template #content>
        <div class="row-between">
          <strong>{{ debt.personName }}</strong>
          <span>{{ debt.remainingCents === debt.originalCents ? formatCents(debt.remainingCents) : `${formatCents(debt.remainingCents)} de ${formatCents(debt.originalCents)}` }}</span>
        </div>
        <p class="movement">{{ debt.tableName }} · {{ formatDateTime(debt.createdAt) }}</p>
        <p v-if="debt.detail" class="hint">{{ debt.detail }}</p>
        <template v-if="receivingId === debt.id">
          <FloatLabel variant="on" class="field" style="margin-top: 0.75rem">
            <InputText :id="`debt-${debt.id}`" v-model="amountText" inputmode="decimal" autocomplete="off" />
            <label :for="`debt-${debt.id}`">Valor recebido</label>
          </FloatLabel>
          <div class="pay-actions">
            <Button label="Dinheiro" :disabled="bar.busy || !bar.openSession" @click="receive('cash')" />
            <Button label="Pix" severity="success" :disabled="bar.busy || !bar.openSession" @click="receive('pix')" />
            <Button label="Cartão" severity="info" :disabled="bar.busy || !bar.openSession" @click="receive('card')" />
          </div>
          <Button class="wide-btn" style="margin-top: 0.5rem" label="Cancelar" severity="secondary" text @click="receivingId = null" />
        </template>
        <Button v-else class="wide-btn" style="margin-top: 0.75rem" label="Receber" icon="pi pi-wallet" :disabled="!bar.openSession" @click="start(debt.id, debt.remainingCents)" />
      </template>
    </Card>
  </section>
</template>
