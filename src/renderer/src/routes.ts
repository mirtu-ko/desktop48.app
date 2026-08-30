import Downloads from './components/Downloads.vue'
import Lives from './components/Lives.vue'
import Setting from './components/Setting.vue'
import Shows from './components/Shows.vue'

const routes: any[] = [
  {
    path: '/lives',
    component: Lives,
  },
  {
    path: '/shows',
    component: Shows,
  },
  {
    path: '/setting',
    component: Setting,
  },
  {
    path: '/downloads',
    component: Downloads,
  },
  {
    path: '/',
    redirect: '/lives',
  },
]
export default routes
