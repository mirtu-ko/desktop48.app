<script setup lang="ts">
import { Film, VideoCamera } from '@element-plus/icons-vue'
import { onMounted, onUnmounted, ref } from 'vue'
import LiveItem from '../components/LiveItem.vue'
import useFloatPlayers from '../composables/use-float-players'
import { enrichLiveItem, usePagedLiveList } from '../composables/use-paged-live-list'
import Apis from '../services/apis'
import EventBus from '../services/event-bus'
import FloatingRefreshDock from './FloatingRefreshDock.vue'
import FloatingTabBar from './FloatingTabBar.vue'
import Reviews from './Reviews.vue'

// 画中画迷你窗：直播/回放/公演共用全局播放挂载点
const { openLive } = useFloatPlayers()

// 顶部浮层 tab 当前选中的视图：live（直播）/ review（回放）
const activeTab = ref<'live' | 'review'>('live')
// 是否加载过回放面板，首次切换到回放时才渲染，避免进入页面即请求回放列表
const reviewMounted = ref(false)
// 成员详情「看 TA 的回放」预置筛选：每次跳转都新建对象，同一成员连续跳转也能触发 Reviews 的 watch
const memberPreset = ref<{ userId: string } | null>(null)

const viewTabs = [
  { label: '直播', key: 'live', icon: VideoCamera },
  { label: '回放', key: 'review', icon: Film },
]

function switchTab(tab: string) {
  if (tab === 'review')
    reviewMounted.value = true
  activeTab.value = tab as 'live' | 'review'
}

// 成员详情抽屉跳转：切到回放面板并按该成员预置级联筛选
function onOpenMemberReviews(userId: unknown) {
  memberPreset.value = { userId: String(userId) }
  switchTab('review')
}

// 双击当前 tab：直播 tab 刷新直播列表，回放 tab 转发给回放组件刷新
const reviewsRef = ref<InstanceType<typeof Reviews> | null>(null)

function onTabsRefresh() {
  if (activeTab.value === 'review')
    reviewsRef.value?.refreshFromTop()
  else
    refreshList()
}

// 分页状态与触底加载：见 composables/use-paged-live-list.ts（直播/回放共用）
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
  // 封面/队伍Logo/日期/成员信息补全：与回放页共用 enrichLiveItem，成员查询失败逐条容错
  processItem: (item: any) => enrichLiveItem(item, 'fallback'),
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
  EventBus.on('open-member-reviews', onOpenMemberReviews)
})

onUnmounted(() => {
  EventBus.off('live-unavailable', onLiveUnavailable)
  EventBus.off('open-member-reviews', onOpenMemberReviews)
})
</script>

<template>
  <div class="lives-root page-root">
    <!-- 左上角浮层 tab：在直播与回放之间切换，悬浮于列表之上；双击当前 tab 刷新 -->
    <FloatingTabBar :tabs="viewTabs" :active="activeTab" @change="switchTab" @refresh="onTabsRefresh" />

    <div v-show="activeTab === 'live'" v-loading="loading" class="live-main">
      <div v-if="!loading && liveList.length === 0" class="live-empty">
        <el-empty description="当前没有直播" />
      </div>

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

      <!-- 右上角浮动操作条：不占行，内容从下方滚过呈现磨砂玻璃 -->
      <FloatingRefreshDock
        :loading="loading"
        title="刷新"
        @refresh="refreshList"
      >
        <span class="live-count">已加载 {{ liveList.length }} 个直播</span>
      </FloatingRefreshDock>
    </div>

    <!-- 回放面板：复用回放组件，首次切换时才渲染并保持状态 -->
    <div v-show="activeTab === 'review'" class="review-main">
      <Reviews v-if="reviewMounted" ref="reviewsRef" :member-preset="memberPreset" />
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 页面骨架（相对定位 + 裁剪）由模板上的全局 .page-root 提供 */

/* 回放面板与直播共用整页高度 */
.review-main {
  height: 100%;
}

.live-count {
  margin-left: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.live-main {
  position: relative;
  height: 100%;
  overflow: hidden;
}

/* 底部留出 Dock 空间（--dock-reserve） */
:deep(.el-scrollbar__view) {
  padding-bottom: var(--dock-reserve);
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
  /* 顶部留出左上角 tab 栏（--tabbar-offset-top），底留卡片悬停上浮与阴影的空间 */
  padding: var(--tabbar-offset-top) 16px 8px;
}

.live-item {
  min-width: 0;
}
</style>
