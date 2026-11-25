import { createRouter, createWebHistory } from 'vue-router'
import TablesView from './views/TablesView.vue'
import ComandaView from './views/ComandaView.vue'
import TodayView from './views/TodayView.vue'
import StockView from './views/StockView.vue'
import SettingsView from './views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'mesas', component: TablesView },
    { path: '/mesa/:tableId', name: 'comanda', component: ComandaView },
    { path: '/hoje', name: 'hoje', component: TodayView },
    { path: '/estoque', name: 'estoque', component: StockView },
    { path: '/cardapio', redirect: '/estoque' },
    { path: '/ajustes', name: 'ajustes', component: SettingsView },
  ],
})
