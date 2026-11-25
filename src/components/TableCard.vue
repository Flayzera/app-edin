<script setup lang="ts">
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { formatCents } from '../money'

defineProps<{
  name: string
  dueCents: number
  itemQty: number
}>()
</script>

<template>
  <Card class="table-card">
    <template #content>
      <span class="row-between">
        <span class="table-card__name">{{ name }}</span>
        <Tag value="Aberta" severity="info" rounded />
      </span>
      <span class="table-card__due">{{ formatCents(dueCents) }}</span>
      <span class="table-card__meta">
        <template v-if="itemQty === 0">Sem consumo</template>
        <template v-else>{{ itemQty }} {{ itemQty === 1 ? 'item' : 'itens' }}</template>
      </span>
    </template>
  </Card>
</template>
