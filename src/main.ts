import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/plus-jakarta-sans'
import 'primeicons/primeicons.css'
import App from './App.vue'
import { router } from './router'
import { useBarStore } from './stores/bar'
import { ptBr } from './locale'
import { balcaoTheme } from './theme'
import './styles.css'

if (import.meta.env.PROD) registerSW({ immediate: true })

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(PrimeVue, {
  locale: ptBr,
  theme: {
    preset: balcaoTheme,
    options: {
      darkModeSelector: '.app-dark',
    },
  },
})
app.use(ToastService)

const bar = useBarStore()
try {
  await bar.init()
} catch (error) {
  console.error(error)
  bar.flash('Não consegui abrir os dados deste celular.')
  bar.ready = true
}
app.mount('#app')
