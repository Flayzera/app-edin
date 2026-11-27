<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import QtyStepper from './QtyStepper.vue'
import Message from 'primevue/message'
import { formatCents } from '../money'
import type { ComandaItem } from '../types'

defineProps<{
  openItems: ComandaItem[]
  paidItems: ComandaItem[]
  cancelledItems: ComandaItem[]
  readonly?: boolean
}>()

const emit = defineEmits<{ set: [id: string, qty: number] }>()

const showCancelled = ref(false)
</script>

<template>
  <Message v-if="openItems.length === 0 && paidItems.length === 0 && cancelledItems.length === 0" severity="secondary" :closable="false" icon="pi pi-receipt">
    Nada lançado ainda.
  </Message>

  <div v-if="openItems.length || paidItems.length" class="list">
    <Card v-for="item in openItems" :key="item.id">
      <template #content>
        <div class="row-between">
          <strong>{{ item.name }}</strong>
          <strong>{{ formatCents(item.unitPriceCents * item.qty) }}</strong>
        </div>
        <p class="muted">{{ item.qty > 1 ? `${formatCents(item.unitPriceCents)} cada` : formatCents(item.unitPriceCents) }}</p>
        <QtyStepper
          v-if="!readonly"
          :model-value="item.qty"
          :min="0"
          :max="999"
          :label="item.name"
          @update:model-value="emit('set', item.id, $event)"
        />
      </template>
    </Card>

    <template v-if="paidItems.length">
      <p class="section-label">Pagos</p>
      <Card v-for="item in paidItems" :key="item.id" class="is-muted">
        <template #content>
          <div class="row-between">
            <strong>{{ item.qty }} × {{ item.name }}</strong>
            <span>{{ formatCents(item.unitPriceCents * item.qty) }}</span>
          </div>
          <p class="muted">Pago</p>
        </template>
      </Card>
    </template>
  </div>

  <Button
    v-if="cancelledItems.length"
    class="wide-btn"
    style="margin-top: 0.75rem"
    :label="showCancelled ? 'Esconder cancelados' : `Ver cancelados (${cancelledItems.length})`"
    severity="secondary"
    outlined
    @click="showCancelled = !showCancelled"
  />
  <div v-if="showCancelled" class="list" style="margin-top: 0.75rem">
    <Card v-for="item in cancelledItems" :key="item.id" class="is-muted">
      <template #content>
        <strong>{{ item.qty }} × {{ item.name }}</strong>
        <p class="muted">Cancelado</p>
      </template>
    </Card>
  </div>
</template>
