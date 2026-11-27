<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { useBarStore } from '../stores/bar'
import { formatCents, parseReais } from '../money'
import type { PaymentMethod } from '../types'
import Sheet from './Sheet.vue'

const props = defineProps<{ comandaId: string }>()
const emit = defineEmits<{
  close: []
  done: [result: 'partial' | 'closed']
}>()

const bar = useBarStore()
const mode = ref<'items' | 'amount'>('items')
const amountText = ref('')
const payerName = ref('')
const picked = reactive<Record<string, number>>({})
const modes = [
  { label: 'Itens', value: 'items' },
  { label: 'Valor', value: 'amount' },
]

const openItems = computed(() => bar.itemsOf(props.comandaId, 'open'))
const due = computed(() => bar.dueOf(props.comandaId))

watch(openItems, (list) => {
  for (const id of Object.keys(picked)) {
    const item = list.find((row) => row.id === id)
    if (!item) delete picked[id]
    else if (picked[id] > item.qty) picked[id] = item.qty
  }
})

const subtotal = computed(() =>
  openItems.value.reduce((sum, item) => sum + (picked[item.id] ?? 0) * item.unitPriceCents, 0),
)

const amountCents = computed(() => parseReais(amountText.value))
const paying = computed(() => (mode.value === 'items' ? subtotal.value : (amountCents.value ?? 0)))
const canPay = computed(() => {
  if (bar.busy || !bar.openSession || due.value < 1 || paying.value < 1 || paying.value > due.value) return false
  const who = payerName.value.trim()
  return who.length > 0 && who.length <= 40
})
const after = computed(() => due.value - paying.value)
const amountInvalid = computed(
  () => mode.value === 'amount' && amountText.value.trim().length > 0 && amountCents.value === null,
)

function setChecked(itemId: string, qty: number, checked: boolean) {
  if (checked) picked[itemId] = qty
  else delete picked[itemId]
}

function setQty(itemId: string, qty: number, max: number) {
  picked[itemId] = Math.min(max, Math.max(1, qty))
}

async function submit(method: PaymentMethod) {
  if (!canPay.value) return
  const result =
    mode.value === 'items'
      ? await bar.payItems(
          props.comandaId,
          Object.entries(picked)
            .filter(([, qty]) => qty > 0)
            .map(([itemId, qty]) => ({ itemId, qty })),
          method,
          payerName.value,
        )
      : await bar.payAmount(props.comandaId, paying.value, method, payerName.value)
  if (result === 'failed') return
  emit('done', result)
}

async function submitFiado() {
  await submit('fiado')
}
</script>

<template>
  <Sheet title="Pagar" @close="emit('close')">
    <Message v-if="!bar.openSession" severity="warn" :closable="false">Abra o caixa antes de receber.</Message>

    <SelectButton v-model="mode" class="mode-switch" :options="modes" optionLabel="label" optionValue="value" :allowEmpty="false" />

    <template v-if="mode === 'items'">
      <p class="hint">Marque só o que essa pessoa consumiu.</p>
      <div v-if="openItems.length === 0" class="empty">Não há itens em aberto.</div>
      <div v-else class="stack" style="margin-top: 0.75rem">
        <div v-for="item in openItems" :key="item.id" class="pay-row">
          <label class="check-row">
            <Checkbox binary :modelValue="Boolean(picked[item.id])" @update:modelValue="setChecked(item.id, 1, $event)" />
            <span>
              <strong>{{ item.name }}</strong>
              <span class="muted" style="display: block">
                {{ item.qty }} × {{ formatCents(item.unitPriceCents) }}
              </span>
            </span>
          </label>
          <div v-if="picked[item.id] && item.qty > 1" class="stepper" style="margin-top: 0.5rem">
            <Button icon="pi pi-minus" rounded text severity="secondary" :disabled="picked[item.id] <= 1" :aria-label="`Pagar menos ${item.name}`" @click="setQty(item.id, picked[item.id] - 1, item.qty)" />
            <span>{{ picked[item.id] }} de {{ item.qty }}</span>
            <Button icon="pi pi-plus" rounded text :disabled="picked[item.id] >= item.qty" :aria-label="`Pagar mais ${item.name}`" @click="setQty(item.id, picked[item.id] + 1, item.qty)" />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <p class="hint">Use quando a divisão não for item por item. Máximo {{ formatCents(due) }}.</p>
      <InputText
        v-model="amountText"
        class="amount-input"
        inputmode="decimal"
        autocomplete="off"
        placeholder="0,00"
        aria-label="Valor a pagar"
      />
      <Message v-if="amountInvalid" severity="error" :closable="false">Digite o valor com até duas casas. Ex.: 40,00</Message>
    </template>

    <FloatLabel variant="on" class="field" style="margin-top: 0.85rem">
      <InputText id="payer-name" v-model="payerName" maxlength="40" autocomplete="off" />
      <label for="payer-name">Quem pagou</label>
    </FloatLabel>

    <Message v-if="canPay" severity="secondary" :closable="false">
      <template v-if="after === 0">A mesa fecha depois deste pagamento.</template>
      <template v-else>A mesa fica com {{ formatCents(after) }}.</template>
    </Message>

    <div class="pay-actions">
      <Button label="Dinheiro" :disabled="!canPay" @click="submit('cash')" />
      <Button label="Pix" severity="success" :disabled="!canPay" @click="submit('pix')" />
      <Button label="Cartão" severity="info" :disabled="!canPay" @click="submit('card')" />
    </div>
    <Button class="wide-btn fiado-btn" label="Fiado" icon="pi pi-book" severity="warn" outlined :disabled="!canPay" @click="submitFiado" />
    <p class="hint">O fiado não entra na gaveta. Fica em A receber até a pessoa pagar.</p>
  </Sheet>
</template>
