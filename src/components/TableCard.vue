<script setup lang="ts">
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { formatCents } from '../money'

defineProps<{
  name: string
  dueCents: number
  itemQty: number
  closed?: boolean
  when?: string
}>()
</script>

<template>
  <Card class="table-card" :class="{ 'is-closed': closed }">
    <template #content>
      <span class="row-between">
        <span class="table-card__name">{{ name }}</span>
        <Tag :value="closed ? 'Fechada' : 'Aberta'" :severity="closed ? 'secondary' : 'info'" rounded />
      </span>
      <span class="table-card__due">{{ formatCents(dueCents) }}</span>
      <span class="table-card__meta">
        <template v-if="closed && when">{{ when }}<template v-if="itemQty"> · {{ itemQty }} {{ itemQty === 1 ? 'item' : 'itens' }}</template></template>
        <template v-else-if="itemQty === 0">Sem consumo</template>
        <template v-else>{{ itemQty }} {{ itemQty === 1 ? 'item' : 'itens' }}</template>
      </span>
    </template>
  </Card>
</template>
