<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
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
  <section v-if="bar.openDebts.length">
    <p class="section-label">A receber</p>
    <Message v-if="!bar.openSession" severity="warn" :closable="false">Abra o caixa antes de receber um fiado.</Message>
    <div class="sheet-table">
      <div class="sheet-head">
        <span>Pessoa</span>
        <span>Valor</span>
        <span></span>
      </div>
      <div v-for="debt in bar.openDebts" :key="debt.id" class="sheet-row" :class="{ 'is-open': receivingId === debt.id }">
        <div class="sheet-who">
          <strong>{{ debt.personName }}</strong>
          <p class="movement">{{ debt.tableName }} · {{ formatDateTime(debt.createdAt) }}</p>
          <p v-if="debt.detail" class="hint">{{ debt.detail }}</p>
        </div>
        <strong class="sheet-money">
          {{ debt.remainingCents === debt.originalCents ? formatCents(debt.remainingCents) : `${formatCents(debt.remainingCents)} de ${formatCents(debt.originalCents)}` }}
        </strong>
        <Button
          v-if="receivingId !== debt.id"
          label="Receber"
          text
          :disabled="!bar.openSession"
          @click="start(debt.id, debt.remainingCents)"
        />
        <Button v-else label="Fechar" severity="secondary" text @click="receivingId = null" />
        <div v-if="receivingId === debt.id" class="sheet-receive">
          <FloatLabel variant="on" class="field">
            <InputText :id="`debt-${debt.id}`" v-model="amountText" inputmode="decimal" autocomplete="off" />
            <label :for="`debt-${debt.id}`">Valor recebido</label>
          </FloatLabel>
          <div class="pay-actions">
            <Button label="Dinheiro" :disabled="bar.busy || !bar.openSession" @click="receive('cash')" />
            <Button label="Pix" severity="success" :disabled="bar.busy || !bar.openSession" @click="receive('pix')" />
            <Button label="Cartão" severity="info" :disabled="bar.busy || !bar.openSession" @click="receive('card')" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
