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
    <el-aside class="app-aside" width="180px">
      <div class="sidebar-inner">
        <el-menu
          :default-active="activeIndex" mode="vertical" router class="side-menu"
          @select="changeMenu"
        >
          <el-menu-item :index="Constants.Menu.LIVES">
            <span class="menu-icon"><el-icon><VideoCamera /></el-icon></span>
            <span class="menu-text">直播</span>
          </el-menu-item>
          <el-menu-item :index="Constants.Menu.Shows">
            <span class="menu-icon"><el-icon><Microphone /></el-icon></span>
            <span class="menu-text">公演</span>
          </el-menu-item>
          <el-menu-item :index="Constants.Menu.Members">
            <span class="menu-icon"><el-icon><User /></el-icon></span>
            <span class="menu-text">成员</span>
          </el-menu-item>
          <el-menu-item :index="Constants.Menu.DOWNLOADS">
            <span class="menu-icon"><el-icon><Download /></el-icon></span>
            <span class="menu-text">下载</span>
          </el-menu-item>
        </el-menu>

        <el-menu
          :default-active="activeIndex" mode="vertical" router class="side-menu side-menu-bottom"
          @select="changeMenu"
        >
          <el-menu-item :index="Constants.Menu.SETTING" class="setting-item">
            <span class="menu-icon"><el-icon><Setting /></el-icon></span>
            <span class="menu-text">设置</span>
          </el-menu-item>
        </el-menu>
      </div>
    </el-aside>

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

    <!-- 全局画中画迷你窗：跨页面持续播放 -->
    <FloatPlayerHost />
  </el-container>
</template>

<style scoped lang="scss">
.el-menu-item [class^='el-icon'] {
  margin-right: 0px;
}

/* 内容区：接替原 el-main 的职责（撑满剩余空间 + 自身滚动 + 收窄留白）。
 * 背景完全透明，直接透出 App.vue 的画布层 */
.app-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 12px 14px 14px;
  overflow: auto;
}

.app-aside {
  display: flex;
  flex-direction: column;
  padding: 10px 4px 10px 10px;
  background: transparent;
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 8px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--el-bg-color) 82%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  border: 1px solid color-mix(in srgb, var(--el-border-color) 45%, transparent);
  box-shadow:
    var(--shadow-sm),
    1px 1px 0 rgba(255, 255, 255, 0.5) inset;
}

.side-menu {
  user-select: none;
  height: auto;
  border-right: none;
  background: transparent;

  :deep(.el-menu-item) {
    height: 44px;
    margin: 3px 0;
    padding: 0 10px !important;
    border-radius: 12px;
    color: var(--el-text-color-regular);
    transition:
      background-color 0.2s ease,
      color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;

    .menu-icon {
      width: 30px;
      height: 30px;
      margin-right: 10px;
      border-radius: 9px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--el-fill-color-light) 70%, transparent);
      color: inherit;
      transition:
        background-color 0.2s ease,
        color 0.2s ease,
        box-shadow 0.2s ease;

      .el-icon {
        font-size: 17px;
      }
    }

    .menu-text {
      font-size: 14px;
      letter-spacing: 0.3px;
    }

    &:hover {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);

      .menu-icon {
        background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
      }
    }

    &.is-active {
      background: linear-gradient(90deg, var(--brand-primary), var(--brand-primary-light));
      color: #fff;
      font-weight: 600;
      box-shadow: var(--shadow-glow);

      .menu-icon {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
      }
    }
  }
}

.side-menu-bottom {
  margin-top: auto;
  padding-top: 4px;
}
</style>
