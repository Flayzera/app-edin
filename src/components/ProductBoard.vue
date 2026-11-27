<script setup lang="ts">
import { computed, ref } from 'vue'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { useRouter } from 'vue-router'
import { useBarStore } from '../stores/bar'
import { formatCents } from '../money'
import QtyStepper from './QtyStepper.vue'

const props = defineProps<{ comandaId: string }>()
const bar = useBarStore()
const router = useRouter()
const pending = ref(false)

const activeProducts = computed(() =>
  bar.products.filter((product) => product.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
)

const groups = computed(() => {
  const byCategory = new Map<string, typeof activeProducts.value>()
  for (const product of activeProducts.value) {
    const list = byCategory.get(product.category) ?? []
    list.push(product)
    byCategory.set(product.category, list)
  }
  return [...byCategory.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([name, products]) => ({ name, products }))
})

function openQty(productId: string) {
  return bar.items
    .filter((item) => item.comandaId === props.comandaId && item.productId === productId && item.status === 'open')
    .reduce((sum, item) => sum + item.qty, 0)
}

function maxOf(productId: string) {
  const product = bar.productById(productId)
  if (!product) return 0
  return Math.min(999, openQty(productId) + Math.max(0, product.stockQty))
}

function stockLabel(productId: string) {
  const product = bar.productById(productId)
  if (!product) return ''
  if (product.stockQty <= 0) return 'Sem estoque'
  if (product.lowStockAt !== null && product.stockQty <= product.lowStockAt) return `Resta ${product.stockQty}`
  return ''
}

async function setQty(productId: string, next: number) {
  if (bar.busy || pending.value) return
  pending.value = true
  try {
    await applyQty(productId, next)
  } finally {
    pending.value = false
  }
}

async function applyQty(productId: string, next: number) {
  if (bar.busy) return
  const product = bar.productById(productId)
  if (!product) return
  const lines = bar.items.filter(
    (item) => item.comandaId === props.comandaId && item.productId === productId && item.status === 'open',
  )
  const current = lines.reduce((sum, item) => sum + item.qty, 0)
  const target = Math.min(maxOf(productId), Math.max(0, next))
  if (target === current) return
  if (target === 0) {
    const ok = await bar.ask('Tirar da mesa', `Tirar ${current} × ${product.name}? O estoque volta.`, 'Tirar')
    if (!ok) return
  }
  if (target > current) {
    await bar.addProductToComanda(props.comandaId, productId, target - current)
    return
  }
  let remove = current - target
  const ordered = [...lines].sort((a, b) => {
    const price = Number(a.unitPriceCents !== product.priceCents) - Number(b.unitPriceCents !== product.priceCents)
    return price || b.createdAt - a.createdAt
  })
  for (const line of ordered) {
    if (remove <= 0) break
    const drop = Math.min(line.qty, remove)
    const ok = await bar.changeItemQty(line.id, line.qty - drop)
    if (!ok) break
    remove -= drop
  }
}
</script>

<template>
  <div v-if="groups.length === 0" class="stack">
    <Message severity="secondary" :closable="false" icon="pi pi-box">Nenhum produto no estoque.</Message>
    <Button label="Cadastrar no estoque" icon="pi pi-plus" severity="secondary" outlined @click="router.push('/estoque')" />
  </div>
  <div v-else class="stack">
    <section v-for="group in groups" :key="group.name">
      <p class="section-label">{{ group.name }}</p>
      <div class="product-grid">
        <Card v-for="product in group.products" :key="product.id" :class="{ 'is-muted': maxOf(product.id) === 0 }">
          <template #content>
            <strong>{{ product.name }}</strong>
            <p class="muted">
              {{ formatCents(product.priceCents) }}
              <template v-if="stockLabel(product.id)"> · {{ stockLabel(product.id) }}</template>
            </p>
            <QtyStepper
              :model-value="openQty(product.id)"
              :min="0"
              :max="maxOf(product.id)"
              :disabled="bar.busy || pending || maxOf(product.id) === 0"
              :label="product.name"
              @update:model-value="setQty(product.id, $event)"
            />
          </template>
        </Card>
      </div>
    </section>
  </div>
</template>
