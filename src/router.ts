import { createRouter, createWebHistory } from 'vue-router'
import TablesView from './views/TablesView.vue'
import ComandaView from './views/ComandaView.vue'
import ClosedBillView from './views/ClosedBillView.vue'
import TodayView from './views/TodayView.vue'
import ReportView from './views/ReportView.vue'
import StockView from './views/StockView.vue'
import SettingsView from './views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'mesas', component: TablesView },
    { path: '/mesa/:tableId', name: 'comanda', component: ComandaView },
    { path: '/conta/:comandaId', name: 'conta', component: ClosedBillView },
    { path: '/caixa', name: 'caixa', component: TodayView },
    { path: '/relatorio', name: 'relatorio', component: ReportView },
    { path: '/hoje', redirect: '/caixa' },
    { path: '/estoque', name: 'estoque', component: StockView },
    { path: '/cardapio', redirect: '/estoque' },
    { path: '/ajustes', name: 'ajustes', component: SettingsView },
  ],
})
