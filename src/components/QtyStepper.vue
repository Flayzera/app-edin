<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import { parseQty } from '../money'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    disabled?: boolean
    label: string
  }>(),
  { min: 0, max: 999, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const text = ref(String(props.modelValue))
const focused = ref(false)

watch(
  () => props.modelValue,
  (value) => {
    if (!focused.value) text.value = String(value)
  },
)

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, value))
}

function commit() {
  focused.value = false
  const parsed = parseQty(text.value)
  const next = parsed === null ? props.modelValue : clamp(parsed)
  text.value = String(props.modelValue)
  if (next !== props.modelValue) emit('update:modelValue', next)
}

function step(delta: number) {
  const next = clamp(props.modelValue + delta)
  if (next !== props.modelValue) emit('update:modelValue', next)
}
</script>

<template>
  <div class="stepper">
    <Button icon="pi pi-minus" rounded text severity="secondary" :disabled="disabled || modelValue <= min" :aria-label="`Diminuir ${label}`" @click="step(-1)" />
    <input
      v-model="text"
      class="stepper-input"
      inputmode="numeric"
      autocomplete="off"
      :disabled="disabled"
      :aria-label="`Quantidade de ${label}`"
      @focus="focused = true"
      @blur="commit"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    />
    <Button icon="pi pi-plus" rounded text :disabled="disabled || modelValue >= max" :aria-label="`Aumentar ${label}`" @click="step(1)" />
  </div>
</template>
