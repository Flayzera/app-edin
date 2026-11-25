<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'

const model = defineModel<string>({ required: true })
const props = defineProps<{ categories: string[] }>()

const NEW = '__new__'
const creating = ref(false)
const draft = ref('')

const options = computed(() => {
  const names = [...props.categories]
  if (model.value && !names.includes(model.value)) names.push(model.value)
  return [
    ...names.map((name) => ({ label: name, value: name })),
    { label: 'Nova categoria', value: NEW },
  ]
})

const selected = computed({
  get: () => (creating.value ? NEW : model.value || null),
  set: (value: string | null) => {
    if (value === NEW) {
      creating.value = true
      draft.value = ''
      return
    }
    creating.value = false
    model.value = value ?? ''
  },
})

function add() {
  const name = draft.value.trim()
  if (!name || name.length > 24) return
  model.value = name
  creating.value = false
  draft.value = ''
}
</script>

<template>
  <div class="stack">
    <Select
      v-model="selected"
      :options="options"
      optionLabel="label"
      optionValue="value"
      placeholder="Categoria"
      emptyMessage="Nenhuma categoria ainda"
      filter
      fluid
    />
    <form v-if="creating" class="actions" @submit.prevent="add">
      <InputText v-model="draft" maxlength="24" placeholder="Nome da categoria" aria-label="Nome da categoria" fluid />
      <Button type="submit" label="Adicionar" />
    </form>
  </div>
</template>
