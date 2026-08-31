<script setup lang="ts">
import { Download, Microphone, Setting, User, VideoCamera } from '@element-plus/icons-vue'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import FloatPlayerHost from './FloatPlayerHost.vue'

const router = useRouter()
const route = useRoute()

// 路由 path 与菜单 index 的映射
const pathToMenu = {
  '/lives': Constants.Menu.LIVES,
  '/shows': Constants.Menu.Shows,
  '/members': Constants.Menu.Members,
  '/downloads': Constants.Menu.DOWNLOADS,
  '/setting': Constants.Menu.SETTING,
}

const activeIndex = ref(pathToMenu[route.path as keyof typeof pathToMenu] || Constants.Menu.LIVES)

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
  <el-container>
    <el-aside class="app-aside" width="220px">
      <div class="app-brand">
        <div class="app-logo">
          48
        </div>
        <div class="brand-text">
          <div class="app-title">
            Desktop48
          </div>
          <div class="app-sub">
            SNH48 直播助手
          </div>
        </div>
      </div>
      <el-menu
        :default-active="activeIndex" mode="vertical" router class="side-menu"
        @select="changeMenu"
      >
        <el-menu-item :index="Constants.Menu.LIVES">
          <el-icon><VideoCamera /></el-icon>
          <span>直播</span>
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.Shows">
          <el-icon><Microphone /></el-icon>
          <span>公演</span>
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.Members">
          <el-icon><User /></el-icon>
          <span>成员</span>
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.DOWNLOADS">
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.SETTING">
          <el-icon><Setting /></el-icon>
          <span>设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-main>
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
    </el-main>

    <!-- 全局画中画迷你窗：跨页面持续播放 -->
    <FloatPlayerHost />
  </el-container>
</template>

<style scoped lang="scss">
.el-main {
  height: 100%;
}

.app-aside {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 16px;

  .app-logo {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light));
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.5px;
    box-shadow: 0 4px 12px rgba(108, 92, 231, 0.3);
  }

  .brand-text {
    min-width: 0;
  }

  .app-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--el-text-color-primary);
  }

  .app-sub {
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.2;
    color: var(--el-text-color-secondary);
  }
}

.side-menu {
  user-select: none;
  flex: 1;
  padding: 6px 0 12px;
  height: auto;
  border-right: none;
  background: transparent;

  :deep(.el-menu-item) {
    height: 44px;
    margin: 4px 12px;
    padding: 0 14px !important;
    border-radius: 10px;
    color: var(--el-text-color-regular);
    transition:
      background-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;

    .el-icon {
      margin-right: 8px;
      font-size: 18px;
    }

    &:hover {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
    }

    &.is-active {
      background: linear-gradient(90deg, var(--brand-primary), var(--brand-primary-light));
      color: #fff;
      font-weight: 600;
      box-shadow: 0 6px 16px rgba(108, 92, 231, 0.28);
    }
  }
}
</style>
