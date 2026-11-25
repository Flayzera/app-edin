<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'

const route = useRoute()
const router = useRouter()

const items = [
  { to: '/', label: 'Mesas', icon: 'pi pi-th-large', names: ['mesas', 'comanda'] },
  { to: '/hoje', label: 'Hoje', icon: 'pi pi-wallet', names: ['hoje'] },
  { to: '/estoque', label: 'Estoque', icon: 'pi pi-box', names: ['estoque'] },
  { to: '/ajustes', label: 'Ajustes', icon: 'pi pi-cog', names: ['ajustes'] },
]
</script>

<template>
  <nav class="nav" aria-label="Seções">
    <Button
      v-for="item in items"
      :key="item.to"
      class="nav-btn"
      :label="item.label"
      :icon="item.icon"
      :text="!item.names.includes(String(route.name))"
      :severity="item.names.includes(String(route.name)) ? 'primary' : 'secondary'"
      @click="router.push(item.to)"
    />
  </nav>
</template>
