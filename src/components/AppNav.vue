<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'

const route = useRoute()
const router = useRouter()

const items = [
  { to: '/', label: 'Mesas', icon: 'pi pi-th-large', names: ['mesas', 'comanda', 'conta'] },
  { to: '/caixa', label: 'Caixa', icon: 'pi pi-wallet', names: ['caixa'] },
  { to: '/relatorio', label: 'Relatório', icon: 'pi pi-chart-bar', names: ['relatorio'] },
  { to: '/estoque', label: 'Estoque', icon: 'pi pi-box', names: ['estoque'] },
  { to: '/ajustes', label: 'Ajustes', icon: 'pi pi-cog', names: ['ajustes'] },
]
</script>

<template>
  <nav class="nav" aria-label="Seções">
    <p class="nav-brand">Balcão</p>
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
