import ElementPlus from 'element-plus'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import routes from './routes'
import Constants from './utils/constants'

import 'element-plus/dist/index.css'
import './assets/css/app.scss'

const app = createApp(App)

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

app.config.globalProperties.Constants = Constants
app.use(router).use(ElementPlus).mount('#app')
