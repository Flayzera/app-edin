<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { useBarStore } from '../stores/bar'
import { formatCents } from '../money'
import Sheet from './Sheet.vue'

const props = defineProps<{ comandaId: string }>()
const emit = defineEmits<{ close: [] }>()

const bar = useBarStore()
const category = ref('Tudo')
const justAdded = ref('')
const counts = reactive<Record<string, number>>({})
let addedTimer = 0

const activeProducts = computed(() => bar.products.filter((product) => product.active))
const categories = computed(() => [
  'Tudo',
  ...[...new Set(activeProducts.value.map((product) => product.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
])
const visible = computed(() =>
  activeProducts.value
    .filter((product) => category.value === 'Tudo' || product.category === category.value)
    .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR')),
)

function stockLabel(productId: string) {
  const product = bar.productById(productId)
  if (!product) return ''
  if (product.stockQty <= 0) return 'Sem estoque'
  if (product.lowStockAt !== null && product.stockQty <= product.lowStockAt) return `Resta ${product.stockQty}`
  return ''
}

function outOfStock(productId: string) {
  const product = bar.productById(productId)
  return !product || product.stockQty <= 0
}

function maxOf(productId: string) {
  const product = bar.productById(productId)
  if (!product) return 1
  return Math.max(1, Math.min(999, product.stockQty))
}

function countOf(productId: string) {
  return counts[productId] ?? 1
}

function setCount(productId: string, next: number) {
  counts[productId] = Math.min(maxOf(productId), Math.max(1, next))
}

async function add(productId: string) {
  const ok = await bar.addProductToComanda(props.comandaId, productId, countOf(productId))
  if (!ok) return
  counts[productId] = 1
  justAdded.value = productId
  window.clearTimeout(addedTimer)
  addedTimer = window.setTimeout(() => {
    justAdded.value = ''
  }, 500)
}
</script>

<template>
  <Sheet title="Adicionar" @close="emit('close')">
    <Select v-if="categories.length > 1" v-model="category" :options="categories" fluid />
    <div v-if="visible.length === 0" class="stack">
      <Message severity="secondary" :closable="false" icon="pi pi-box">Nenhum produto no estoque.</Message>
      <Button label="Cadastrar no estoque" icon="pi pi-plus" severity="secondary" outlined @click="emit('close'); $router.push('/estoque')" />
    </div>
    <div v-else class="product-pick">
      <div v-for="product in visible" :key="product.id" class="pick-row" :class="{ 'just-added': justAdded === product.id, 'is-muted': outOfStock(product.id) }">
        <div>
          <strong>{{ product.name }}</strong>
          <span class="muted" style="display: block">
            {{ formatCents(product.priceCents) }}
            <template v-if="stockLabel(product.id)"> · {{ stockLabel(product.id) }}</template>
          </span>
        </div>
        <div class="pick-actions">
          <div class="stepper">
            <Button icon="pi pi-minus" rounded text severity="secondary" :disabled="outOfStock(product.id) || countOf(product.id) <= 1" :aria-label="`Menos ${product.name}`" @click="setCount(product.id, countOf(product.id) - 1)" />
            <span>{{ countOf(product.id) }}</span>
            <Button icon="pi pi-plus" rounded text :disabled="outOfStock(product.id) || countOf(product.id) >= maxOf(product.id)" :aria-label="`Mais ${product.name}`" @click="setCount(product.id, countOf(product.id) + 1)" />
          </div>
          <Button icon="pi pi-check" rounded :disabled="outOfStock(product.id) || bar.busy" :aria-label="`Adicionar ${countOf(product.id)} ${product.name}`" @click="add(product.id)" />
        </div>
      </div>
    </div>
  </Sheet>
</template>
