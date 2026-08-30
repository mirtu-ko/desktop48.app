<script setup lang="ts">
import { Film, Refresh, VideoCamera } from '@element-plus/icons-vue'
import { onMounted, onUnmounted, ref } from 'vue'
import Apis from '../assets/js/apis'
import EventBus from '../assets/js/event-bus'
import Tools from '../assets/js/tools'
import useFloatPlayers from '../assets/js/use-float-players'
import usePagedLiveList from '../assets/js/use-paged-live-list'
import LiveItem from '../components/LiveItem.vue'
import FloatingDock from './FloatingDock.vue'
import FloatingTabBar from './FloatingTabBar.vue'
import Reviews from './Reviews.vue'

// 画中画迷你窗：直播/回放/公演共用全局播放挂载点
const { openLive } = useFloatPlayers()

// 顶部浮层 tab 当前选中的视图：live（直播）/ review（回放）
const activeTab = ref<'live' | 'review'>('live')
// 是否加载过回放面板，首次切换到回放时才渲染，避免进入页面即请求回放列表
const reviewMounted = ref(false)

const viewTabs = [
  { label: '直播', key: 'live', icon: VideoCamera },
  { label: '回放', key: 'review', icon: Film },
]

function switchTab(tab: string) {
  if (tab === 'review')
    reviewMounted.value = true
  activeTab.value = tab as 'live' | 'review'
}

// 分页列表状态/逻辑/触底加载统一由组合式函数管理，直播与回放共用同一套
const {
  list: liveList,
  loading,
  noMore,
  scrollbarRef: liveScrollRef,
  onInfiniteScroll,
  getList: getLiveList,
  refresh,
} = usePagedLiveList({
  loadPage: next => Apis.instance().lives(next),
  processItem: async (item: any) => {
    item.cover = Tools.pictureUrls(item.coverPath)
    item.userInfo.teamLogo = Tools.pictureUrls(item.userInfo.teamLogo)
    item.date = Tools.dateFormat(Number.parseFloat(item.ctime), 'yyyy-MM-dd hh:mm:ss')
    try {
      item.member = await window.mainAPI.getMember(item.userInfo.userId)
    }
    catch (e) {
      item.member = null
      console.error('获取成员信息失败:', e)
    }
  },
  stopOnError: false,
})

// 点击卡片：以画中画迷你窗打开直播，可边看边继续浏览列表
function play(item: any) {
  openLive({
    liveId: item.liveId,
    nickname: item.userInfo.nickname,
    title: item.title,
    startTime: Number.parseInt(item.ctime),
    liveType: item.liveType,
    liveMode: item.liveMode,
  })
}

// 浮窗放流失败（流已不存在/直播下架）时，若该直播属于本页列表则自动刷新
function onLiveUnavailable(liveId: unknown) {
  const inList = liveList.value.some(item => item.liveId === liveId)
  if (inList)
    refreshList()
}

// 手动/自动刷新：重置分页后拉取最新列表，并回到列表顶部
function refreshList() {
  liveScrollRef.value?.setScrollTop?.(0)
  refresh()
}

onMounted(() => {
  getLiveList()
  EventBus.on('live-unavailable', onLiveUnavailable)
})

onUnmounted(() => {
  EventBus.off('live-unavailable', onLiveUnavailable)
})
</script>

<template>
  <div class="lives-root">
    <!-- 左上角浮层 tab：在直播与回放之间切换，悬浮于列表之上 -->
    <FloatingTabBar :tabs="viewTabs" :active="activeTab" @change="switchTab" />

    <div v-show="activeTab === 'live'" v-loading="loading" class="live-main">
      <!-- 无直播时显示 -->
      <div v-if="!loading && liveList.length === 0" class="live-empty">
        <el-empty description="当前没有直播">
          <el-button type="primary" :icon="Refresh" @click="refreshList">
            刷新
          </el-button>
        </el-empty>
      </div>

      <!-- 有直播时显示 -->
      <el-scrollbar
        v-if="liveList.length > 0"
        ref="liveScrollRef"
        class="scrollbar-wrapper"
        :distance="10"
        @end-reached="onInfiniteScroll"
      >
        <div class="live-list">
          <div v-for="item in liveList" :key="item.liveId" class="live-item" @click="play(item)">
            <LiveItem :item="item" />
          </div>
        </div>
        <div v-if="noMore" class="list-end">
          没有更多直播了
        </div>
      </el-scrollbar>

      <!-- 右下角浮动操作条：不占行，内容从下方滚过呈现磨砂玻璃 -->
      <FloatingDock>
        <span class="live-count">已加载 {{ liveList.length }} 个直播</span>
        <el-button
          circle type="primary" :icon="Refresh" :loading="loading" title="刷新"
          @click="refreshList"
        />
      </FloatingDock>
    </div>

    <!-- 回放面板：复用回放组件，首次切换时才渲染并保持状态 -->
    <div v-show="activeTab === 'review'" class="review-main">
      <Reviews v-if="reviewMounted" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.lives-root {
  position: relative;
  height: 100%;
  overflow: hidden;
}

/* 回放面板与直播共用整页高度 */
.review-main {
  height: 100%;
}

.live-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.live-main {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.scrollbar-wrapper {
  height: 100%;
  overflow-x: hidden !important;
}

/* 给列表底部留出浮动操作条的空间 */
:deep(.el-scrollbar__view) {
  padding-bottom: 88px;
}

.live-empty {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.live-list {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  /* 顶部留出左上角 tab 栏，底留卡片悬停上浮与阴影的空间 */
  padding: 64px 16px 8px;
}

.live-item {
  min-width: 0;
}
</style>
