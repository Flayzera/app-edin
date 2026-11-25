<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import CategorySelect from '../components/CategorySelect.vue'
import ProductSales from '../components/ProductSales.vue'
import { useBarStore } from '../stores/bar'
import { formatCents, formatTodayLabel, parseQty, parseReais, startOfToday } from '../money'
import { reasonLabel } from '../labels'
import ScreenHeader from '../components/ScreenHeader.vue'
import type { Product } from '../types'

const bar = useBarStore()
const editor = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  price: '',
  category: '',
  openingQty: '',
  lowStockAt: '',
})
const selectedId = ref<string | null>(null)
const mode = ref<'in' | 'adjust'>('in')
const qtyText = ref('')
const note = ref('')

const categories = computed(() =>
  [...new Set(bar.products.map((product) => product.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
)
const active = computed(() => bar.products.filter((product) => product.active))
const archived = computed(() => bar.products.filter((product) => !product.active))
const grouped = computed(() => {
  const map = new Map<string, Product[]>()
  for (const product of active.value) {
    const list = map.get(product.category) ?? []
    list.push(product)
    map.set(product.category, list)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
})
const editing = computed(() => (editingId.value ? bar.productById(editingId.value) : null))
const selected = computed(() => (selectedId.value ? bar.productById(selectedId.value) : null))
const lowCount = computed(() => bar.lowStockProducts.length)
const salesDay = ref(new Date())
const salesDayLabel = computed(() => formatTodayLabel(salesDay.value))
const salesIsToday = computed(() => startOfToday(salesDay.value) === startOfToday())

function shiftSalesDay(delta: number) {
  const next = new Date(salesDay.value)
  next.setDate(next.getDate() + delta)
  if (startOfToday(next) > startOfToday()) return
  salesDay.value = next
}

function isLow(product: Product) {
  return product.lowStockAt !== null && product.stockQty <= product.lowStockAt
}

function movementText(productId: string) {
  const movement = bar.latestMovement(productId)
  if (!movement) return ''
  const sign = movement.delta > 0 ? `+${movement.delta}` : String(movement.delta)
  const detail = movement.note ? ` · ${movement.note}` : ''
  return `${sign} · ${reasonLabel[movement.reason]}${detail}`
}

function startCreate() {
  selectedId.value = null
  editingId.value = null
  form.name = ''
  form.price = ''
  form.category = ''
  form.openingQty = ''
  form.lowStockAt = ''
  editor.value = true
}

function startEdit(product: Product) {
  selectedId.value = null
  editingId.value = product.id
  form.name = product.name
  form.price = (product.priceCents / 100).toFixed(2).replace('.', ',')
  form.category = product.category
  form.openingQty = ''
  form.lowStockAt = product.lowStockAt === null ? '' : String(product.lowStockAt)
  editor.value = true
}

function openMovement(product: Product, next: 'in' | 'adjust') {
  editor.value = false
  selectedId.value = product.id
  mode.value = next
  qtyText.value = next === 'adjust' ? String(product.stockQty) : ''
  note.value = ''
}

async function saveProduct() {
  const priceCents = parseReais(form.price)
  if (priceCents === null) {
    bar.flash('Preço inválido. Use 12,50.')
    return
  }
  const lowStockAt = form.lowStockAt.trim() === '' ? null : parseQty(form.lowStockAt)
  if (form.lowStockAt.trim() !== '' && lowStockAt === null) {
    bar.flash('O aviso de estoque precisa ser um número inteiro.')
    return
  }
  const openingQty = editing.value ? null : parseQty(form.openingQty)
  if (!editing.value && openingQty === null) {
    bar.flash('Informe a quantidade em estoque.')
    return
  }
  const saved = await bar.saveProduct({
    id: editingId.value ?? undefined,
    name: form.name,
    priceCents,
    category: form.category,
    trackStock: true,
    openingQty,
    lowStockAt,
  })
  if (saved) editor.value = false
}

async function saveMovement() {
  if (!selected.value) return
  const qty = parseQty(qtyText.value)
  if (qty === null) {
    bar.flash(mode.value === 'in' ? 'Informe uma quantidade inteira.' : 'Informe a quantidade contada.')
    return
  }
  const saved =
    mode.value === 'in'
      ? await bar.receiveStock(selected.value.id, qty, note.value)
      : await bar.adjustStock(selected.value.id, qty, note.value)
  if (saved) selectedId.value = null
}

async function archive(product: Product) {
  const ok = await bar.ask(
    'Arquivar produto',
    `${product.name} sai da lista. O saldo e o histórico ficam guardados.`,
    'Arquivar',
  )
  if (ok) await bar.setProductActive(product.id, false)
}

async function remove(product: Product) {
  const ok = await bar.ask(
    'Apagar produto',
    `Apagar ${product.name}? Ele sai do estoque. As vendas já registradas no caixa continuam.`,
    'Apagar',
  )
  if (ok) await bar.deleteProduct(product.id)
}
</script>

<template>
  <main class="screen">
    <ScreenHeader
      eyebrow="Estoque"
      title="Produtos"
      subtitle="Cada produto entra com quantidade. A venda desconta e o cancelamento devolve."
    >
      <Button v-if="!editor && !selected" label="Novo produto" icon="pi pi-plus" @click="startCreate" />
    </ScreenHeader>

    <form v-if="editor" class="stack" @submit.prevent="saveProduct">
      <FloatLabel variant="on" class="field">
        <InputText id="product-name" v-model="form.name" required maxlength="40" autocomplete="off" />
        <label for="product-name">Nome</label>
      </FloatLabel>
      <FloatLabel variant="on" class="field">
        <InputText id="product-price" v-model="form.price" required inputmode="decimal" autocomplete="off" />
        <label for="product-price">Preço</label>
      </FloatLabel>
      <CategorySelect v-model="form.category" :categories="categories" />
      <FloatLabel v-if="!editing" variant="on" class="field">
        <InputText id="opening-qty" v-model="form.openingQty" inputmode="numeric" required />
        <label for="opening-qty">Quantidade agora</label>
      </FloatLabel>
      <Message v-else severity="secondary" :closable="false">
        Estoque atual: {{ editing.stockQty }}. Entrada e ajuste ficam na lista.
      </Message>
      <FloatLabel variant="on" class="field">
        <InputText id="low-stock" v-model="form.lowStockAt" inputmode="numeric" />
        <label for="low-stock">Avisar quando chegar a</label>
      </FloatLabel>
      <div class="actions">
        <Button label="Cancelar" severity="secondary" outlined type="button" @click="editor = false" />
        <Button label="Salvar" type="submit" :disabled="bar.busy" />
      </div>
    </form>

    <form v-else-if="selected" class="stack" @submit.prevent="saveMovement">
      <p class="kicker">{{ mode === 'in' ? 'Entrada' : 'Ajuste' }}</p>
      <h2>{{ selected.name }}</h2>
      <p class="qty">{{ selected.stockQty }}</p>
      <FloatLabel variant="on" class="field">
        <InputText id="stock-qty" v-model="qtyText" inputmode="numeric" required />
        <label for="stock-qty">{{ mode === 'in' ? 'Quantidade que chegou' : 'Quanto tem agora' }}</label>
      </FloatLabel>
      <FloatLabel variant="on" class="field">
        <InputText id="stock-note" v-model="note" maxlength="80" autocomplete="off" />
        <label for="stock-note">Nota</label>
      </FloatLabel>
      <div class="actions">
        <Button label="Cancelar" severity="secondary" outlined type="button" @click="selectedId = null" />
        <Button label="Salvar" type="submit" :disabled="bar.busy" />
      </div>
    </form>

    <template v-else>
      <div v-if="grouped.length || archived.length" class="day-nav">
        <Button icon="pi pi-chevron-left" severity="secondary" text rounded aria-label="Dia anterior" @click="shiftSalesDay(-1)" />
        <div>
          <p class="kicker">Vendas pagas</p>
          <p>{{ salesDayLabel }}</p>
        </div>
        <Button icon="pi pi-chevron-right" severity="secondary" text rounded aria-label="Próximo dia" :disabled="salesIsToday" @click="shiftSalesDay(1)" />
      </div>
      <Message v-if="lowCount" severity="warn" :closable="false">
        {{ lowCount === 1 ? '1 produto no limite' : `${lowCount} produtos no limite` }}
      </Message>
      <Message v-if="grouped.length === 0 && archived.length === 0" severity="secondary" :closable="false" icon="pi pi-box">
        Nenhum produto ainda. Cadastre o primeiro com o saldo que você tem.
      </Message>
      <section v-for="[category, products] in grouped" :key="category">
        <p class="section-label">{{ category }}</p>
        <div class="list">
          <Card v-for="product in products" :key="product.id" :class="{ 'low-card': isLow(product) }">
            <template #content>
              <div class="row-between">
                <strong>{{ product.name }}</strong>
                <span>{{ formatCents(product.priceCents) }}</span>
              </div>
              <div class="row-between">
                <p class="qty">{{ product.stockQty }}</p>
                <Tag v-if="isLow(product)" value="Baixo" severity="warn" rounded />
              </div>
              <p v-if="movementText(product.id)" class="movement">{{ movementText(product.id) }}</p>
              <ProductSales :product-id="product.id" :day="salesDay" />
              <div class="actions" style="margin-top: 0.75rem">
                <Button label="Entrada" icon="pi pi-plus" @click="openMovement(product, 'in')" />
                <Button label="Ajuste" icon="pi pi-sliders-h" severity="secondary" outlined @click="openMovement(product, 'adjust')" />
              </div>
              <div class="actions" style="margin-top: 0.5rem">
                <Button label="Editar" icon="pi pi-pencil" size="small" severity="secondary" outlined @click="startEdit(product)" />
                <Button label="Arquivar" icon="pi pi-inbox" size="small" severity="secondary" text @click="archive(product)" />
              </div>
              <Button class="wide-btn" style="margin-top: 0.35rem" label="Apagar" icon="pi pi-trash" size="small" severity="danger" text @click="remove(product)" />
            </template>
          </Card>
        </div>
      </section>

      <section v-if="archived.length">
        <p class="section-label">Arquivados</p>
        <div class="list">
          <Card v-for="product in archived" :key="product.id">
            <template #content>
              <div class="row-between">
                <strong>{{ product.name }}</strong>
                <span class="muted">{{ product.stockQty }}</span>
              </div>
              <ProductSales :product-id="product.id" :day="salesDay" />
              <div class="actions" style="margin-top: 0.75rem">
                <Button label="Reativar" severity="secondary" outlined @click="bar.setProductActive(product.id, true)" />
                <Button label="Apagar" icon="pi pi-trash" severity="danger" text @click="remove(product)" />
              </div>
            </template>
          </Card>
        </div>
      </section>
    </template>
  </main>
</template>
