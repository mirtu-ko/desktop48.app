import Albums from './pages/Albums.vue'
import Downloads from './pages/Downloads.vue'
import Lives from './pages/Lives.vue'
import Members from './pages/Members.vue'
import Setting from './pages/Setting.vue'
import Shows from './pages/Shows.vue'

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
    path: '/albums',
    component: Albums,
  },
  {
    path: '/members',
    component: Members,
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
