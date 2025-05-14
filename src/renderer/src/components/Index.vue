<script setup lang="ts">
import { onBeforeMount, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Apis from '../assets/js/apis.js'
import Constants from '../assets/js/constants.js'
import EventBus from '../assets/js/event-bus.js'

const router = useRouter()
const route = useRoute()

// 路由 path 与菜单 index 的映射
const pathToMenu = {
  '/lives': Constants.Menu.LIVES,
  '/reviews': Constants.Menu.REVIEWS,
  '/shows': Constants.Menu.Shows,
  '/downloads': Constants.Menu.DOWNLOADS,
  '/setting': Constants.Menu.SETTING,
}

const activeIndex = ref(pathToMenu[route.path as keyof typeof pathToMenu] || Constants.Menu.LIVES)

function handleMenuSelect(index: string) {
  activeIndex.value = index
  router.push(index)
}

// 路由变化时自动同步菜单高亮
watch(
  () => route.path,
  (newPath) => {
    activeIndex.value = pathToMenu[newPath as keyof typeof pathToMenu] || Constants.Menu.LIVES
  },
)

onBeforeMount(() => {
// 清空localStorage中的liveTabs缓存
  localStorage.removeItem('liveTabs')
  localStorage.removeItem('reviewTabs')
})

let changeMenuHandler: any
onMounted(async () => {
  changeMenuHandler = (menu: string) => {
    activeIndex.value = menu
    router.push(menu)
  }
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
    <el-aside style="width: 200px;">
      <el-menu
        :default-active="activeIndex" mode="vertical" router class="side-menu" background-color="#545c64"
        text-color="#fff" active-text-color="#ffd04b" @select="handleMenuSelect"
      >
        <el-menu-item :index="Constants.Menu.LIVES">
          直播
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.REVIEWS">
          回放
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.Shows">
          演出
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.DOWNLOADS">
          下载
        </el-menu-item>
        <el-menu-item :index="Constants.Menu.SETTING">
          设置
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
  </el-container>
</template>

<style scoped lang="scss">
.el-main {
  height: calc(100%);
}

.side-menu {
  height: 100%;
}
.side-menu:not(.el-menu--collapse) {
  min-height: 100%;
}

:deep(.el-menu--vertical) {
  .el-menu-item {
    justify-content: center;
  }
}
</style>
