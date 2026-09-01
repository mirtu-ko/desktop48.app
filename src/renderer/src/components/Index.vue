<script setup lang="ts">
import { Download, Headset, Microphone, Setting, User, VideoCamera } from '@element-plus/icons-vue'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import AppDock from './AppDock.vue'
import FloatAudioBar from './FloatAudioBar.vue'
import FloatPlayerHost from './FloatPlayerHost.vue'

const router = useRouter()
const route = useRoute()

// 路由 path 与菜单 index 的映射
const pathToMenu = {
  '/lives': Constants.Menu.LIVES,
  '/shows': Constants.Menu.Shows,
  '/albums': Constants.Menu.Albums,
  '/members': Constants.Menu.Members,
  '/downloads': Constants.Menu.DOWNLOADS,
  '/setting': Constants.Menu.SETTING,
}

const activeIndex = ref(pathToMenu[route.path as keyof typeof pathToMenu] || Constants.Menu.LIVES)

// 底部 Dock 菜单项（每项带专属主题色，用于激活/悬浮的图标渐变）
const dockItems = [
  { index: Constants.Menu.LIVES, label: '直播', icon: VideoCamera, color: '#ff5e7e' },
  { index: Constants.Menu.Shows, label: '公演', icon: Microphone, color: '#f59e0b' },
  { index: Constants.Menu.Albums, label: '专辑', icon: Headset, color: '#d946ef' },
  { index: Constants.Menu.Members, label: '成员', icon: User, color: '#3b82f6' },
  { index: Constants.Menu.DOWNLOADS, label: '下载', icon: Download, color: '#10b981' },
  { index: Constants.Menu.SETTING, label: '设置', icon: Setting, color: '#6d5ae0' },
]

function changeMenu(menu: string) {
  activeIndex.value = menu
  router.push(menu)
}

// 路由变化时自动同步菜单高亮
watch(
  () => route.path,
  (newPath) => {
    activeIndex.value = pathToMenu[newPath as keyof typeof pathToMenu] || Constants.Menu.LIVES
  },
)

let changeMenuHandler: any

onMounted(async () => {
  changeMenuHandler = changeMenu
  EventBus.on('change-selected-menu', changeMenuHandler)
  // 当数据库没有成员信息时
  if (!(await window.mainAPI.hasMembers?.())) {
    console.log('[Index.vue]数据库没有成员信息, 同步成员信息')
    await Apis.instance().syncInfo()
    console.log('[Index.vue]数据库没有成员信息, 同步完成')
  }
})

onUnmounted(() => {
  EventBus.off('change-selected-menu', changeMenuHandler)
})
</script>

<template>
  <div class="app-layout">
    <div class="app-content">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <Suspense>
            <template #default>
              <component :is="Component" />
            </template>
            <template #fallback>
              <div>Loading...</div>
            </template>
          </Suspense>
        </keep-alive>
      </router-view>
    </div>

    <!-- 底部 Dock 导航栏（磨砂表层复用全局 .frosted-surface） -->
    <AppDock
      :items="dockItems"
      :active="activeIndex"
      @change="changeMenu"
    />

    <!-- 全局画中画迷你窗：跨页面持续播放 -->
    <FloatPlayerHost />

    <!-- 全局音乐迷你播放条：跨页面持续播放专辑歌曲 -->
    <FloatAudioBar />
  </div>
</template>

<style scoped lang="scss">
/* 内容区：撑满剩余空间 + 自身滚动 + 底部预留 Dock 空间。
 * 背景完全透明，直接透出 App.vue 的画布层 */
.app-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 0px;
  overflow: auto;
}
</style>
