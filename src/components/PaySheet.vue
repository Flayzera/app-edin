<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import QRCode from 'qrcode'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { useBarStore } from '../stores/bar'
import { formatCents, parseReais } from '../money'
import { isReadyPix, pixPayload } from '../pix'
import type { ItemSelection, PaymentMethod } from '../types'
import Sheet from './Sheet.vue'

const props = defineProps<{ comandaId: string }>()
const emit = defineEmits<{
  close: []
  done: [result: 'partial' | 'closed']
}>()

interface Charge {
  mode: 'full' | 'items' | 'amount'
  amountCents: number
  selections: ItemSelection[]
  payerName: string
  expiresAt: number
  expireNoted: boolean
}

const bar = useBarStore()
const mode = ref<'full' | 'items' | 'amount'>('items')
const amountText = ref('')
const payerName = ref('')
const picked = reactive<Record<string, number>>({})
const charge = ref<Charge | null>(null)
const qrUrl = ref('')
const now = ref(Date.now())
const modes = [
  { label: 'Cheio', value: 'full' },
  { label: 'Itens', value: 'items' },
  { label: 'Valor', value: 'amount' },
]
let clock = 0
let settled = false

const openItems = computed(() => bar.itemsOf(props.comandaId, 'open'))
const due = computed(() => bar.dueOf(props.comandaId))
const pixReady = computed(() => isReadyPix(bar.pix))

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
const paying = computed(() => {
  if (mode.value === 'items') return subtotal.value
  if (mode.value === 'amount') return amountCents.value ?? 0
  return due.value
})
const needsName = computed(() => mode.value !== 'items')
const canPay = computed(() => {
  if (bar.busy || due.value < 1 || paying.value < 1 || paying.value > due.value) return false
  if (!needsName.value) return true
  const who = payerName.value.trim()
  return who.length > 0 && who.length <= 40
})
const after = computed(() => due.value - paying.value)
const amountInvalid = computed(
  () => mode.value === 'amount' && amountText.value.trim().length > 0 && amountCents.value === null,
)
const leftMs = computed(() => (charge.value ? Math.max(0, charge.value.expiresAt - now.value) : 0))
const clockLabel = computed(() => {
  const total = Math.min(10 * 60, Math.ceil(leftMs.value / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const expired = computed(() => charge.value !== null && leftMs.value === 0)

watch(expired, (isExpired) => {
  if (!isExpired || !charge.value || charge.value.expireNoted) return
  charge.value.expireNoted = true
  bar.trace('Pix expirou', `${formatCents(charge.value.amountCents)} · ${bar.nameForComanda(props.comandaId)}`)
})

onMounted(() => {
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 250)
})

onUnmounted(() => {
  window.clearInterval(clock)
  if (charge.value && !settled) {
    if (!charge.value.expireNoted) {
      bar.trace('Pix cancelado', `${formatCents(charge.value.amountCents)} · ${bar.nameForComanda(props.comandaId)}`)
    }
    bar.flash('O valor continua na conta.')
  }
})

function setChecked(itemId: string, qty: number, checked: boolean) {
  if (checked) picked[itemId] = qty
  else delete picked[itemId]
}

function setQty(itemId: string, qty: number, max: number) {
  picked[itemId] = Math.min(max, Math.max(1, qty))
}

function selections(): ItemSelection[] {
  return Object.entries(picked)
    .filter(([, qty]) => qty > 0)
    .map(([itemId, qty]) => ({ itemId, qty }))
}

async function submit(method: PaymentMethod, snapshot?: Charge) {
  if (!snapshot && !canPay.value) return 'failed' as const
  const currentMode = snapshot?.mode ?? mode.value
  const result =
    currentMode === 'items'
      ? await bar.payItems(props.comandaId, snapshot?.selections ?? selections(), method)
      : await bar.payAmount(props.comandaId, snapshot?.amountCents ?? paying.value, method, snapshot?.payerName ?? payerName.value)
  if (result === 'failed') return result
  emit('done', result)
  return result
}

async function startPix() {
  if (!canPay.value) return
  if (!pixReady.value) {
    bar.flash('Cadastre a chave Pix em Ajustes.')
    return
  }
  const amountCents = paying.value
  const next: Charge = {
    mode: mode.value,
    amountCents,
    selections: mode.value === 'items' ? selections() : [],
    payerName: needsName.value ? payerName.value.trim() : '',
    expiresAt: Date.now() + 10 * 60 * 1000,
    expireNoted: false,
  }
  try {
    qrUrl.value = await QRCode.toDataURL(pixPayload(bar.pix, amountCents), {
      margin: 1,
      width: 280,
      errorCorrectionLevel: 'M',
    })
  } catch {
    bar.flash('Não consegui gerar o QR.')
    return
  }
  charge.value = next
  bar.trace('Pix gerado', `${formatCents(amountCents)} · ${bar.nameForComanda(props.comandaId)}`)
}

async function confirmPix() {
  if (!charge.value || bar.busy) return
  const current = charge.value
  settled = true
  const result = await submit('pix', current)
  if (result === 'failed') settled = false
}

function cancelPix() {
  if (!charge.value) return
  const current = charge.value
  charge.value = null
  qrUrl.value = ''
  if (!current.expireNoted) {
    bar.trace('Pix cancelado', `${formatCents(current.amountCents)} · ${bar.nameForComanda(props.comandaId)}`)
  }
  bar.flash('O valor continua na conta.')
}
</script>

<template>
  <Sheet :title="charge ? 'Pix' : 'Pagar'" @close="emit('close')">
    <template v-if="charge">
      <p class="hint">Espere a notificação do banco. A conta só muda quando você confirmar.</p>
      <p class="pix-amount">{{ formatCents(charge.amountCents) }}</p>
      <p class="pix-timer" :class="{ 'is-late': leftMs <= 60_000 }">{{ expired ? 'Tempo esgotado' : clockLabel }}</p>
      <div class="pix-box">
        <img :src="qrUrl" alt="QR Code Pix" />
      </div>
      <Message v-if="expired" severity="warn" :closable="false">
        Se a notificação chegou, confirme. Se não, cancele e o valor continua na conta.
      </Message>
      <div class="stack" style="margin-top: 1rem">
        <Button label="Caiu" icon="pi pi-check" :disabled="bar.busy" @click="confirmPix" />
        <Button label="Cancelar" icon="pi pi-times" severity="secondary" outlined :disabled="bar.busy" @click="cancelPix" />
      </div>
    </template>

    <template v-else>
      <SelectButton v-model="mode" class="mode-switch" :options="modes" optionLabel="label" optionValue="value" :allowEmpty="false" />

      <template v-if="mode === 'full'">
        <p class="hint">Cobra tudo que ainda está em aberto.</p>
        <p class="pix-amount">{{ formatCents(due) }}</p>
      </template>

      <template v-else-if="mode === 'items'">
        <p class="hint">Marque só o que essa pessoa consumiu.</p>
        <div v-if="openItems.length === 0" class="empty">Não há itens em aberto.</div>
        <div v-else class="stack" style="margin-top: 0.75rem">
          <div v-for="item in openItems" :key="item.id" class="pay-row">
            <label class="check-row">
              <Checkbox binary :modelValue="Boolean(picked[item.id])" @update:modelValue="setChecked(item.id, item.qty, $event)" />
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

      <FloatLabel v-if="needsName" variant="on" class="field" style="margin-top: 0.85rem">
        <InputText id="payer-name" v-model="payerName" maxlength="40" autocomplete="off" />
        <label for="payer-name">Quem pagou</label>
      </FloatLabel>

      <Message v-if="canPay" severity="secondary" :closable="false">
        <template v-if="after === 0">A mesa fecha depois deste pagamento.</template>
        <template v-else>A mesa fica com {{ formatCents(after) }}.</template>
      </Message>
      <Message v-if="!pixReady" severity="warn" :closable="false">Cadastre a chave Pix em Ajustes para gerar o QR.</Message>

      <div class="pay-actions">
        <Button label="Dinheiro" icon="pi pi-wallet" :disabled="!canPay" @click="submit('cash')" />
        <Button label="Pix" icon="pi pi-qrcode" severity="success" :disabled="!canPay || !pixReady" @click="startPix" />
      </div>
    </template>
  </Sheet>
</template>
