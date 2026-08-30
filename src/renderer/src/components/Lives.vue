<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import EventBus from '../assets/js/event-bus'
import Tools from '../assets/js/tools'
import useLoadMore from '../assets/js/use-load-more'
import LiveItem from '../components/LiveItem.vue'
import LivePlayer from '../components/LivePlayer.vue'

const route = useRoute()
const router = useRouter()

const liveList = ref<any[]>([])
const liveNext = ref('0')
const loading = ref(false)
const noMore = ref(false)

// 列表请求序号，用于丢弃过期响应，避免刷新/滚动并发时数据错乱
let listRequestId = 0

const disabled = computed(() => loading.value || noMore.value)

const liveScrollRef = ref<any>(null)

// 统一的触底加载：直播/回放/公演三页共用同一套交互逻辑
const { onInfiniteScroll } = useLoadMore({
  load: getLiveList,
  disabled,
  scrollbarRef: liveScrollRef,
})

// 更新隐藏的成员ID
const hiddenMemberIds = ref<number[]>([])

async function updateHiddenMemberIds() {
  const hiddenMembers = await window.mainAPI.getHiddenMembers()
  hiddenMemberIds.value = hiddenMembers.map((member: any) => member.userId)
}

// 加载更多
async function getLiveList() {
  const requestId = ++listRequestId
  // console.log('[Lives.vue] getLiveList 方法开始执行')
  loading.value = true
  try {
    await updateHiddenMemberIds()
    if (requestId !== listRequestId)
      return
    const content = await Apis.instance().lives(liveNext.value)
    if (requestId !== listRequestId)
      return
    // console.log('获取到的直播列表:', content)
    if (content.next === '0') {
      noMore.value = true
    }
    liveNext.value = content.next

    // 先过滤掉被屏蔽的成员，再并行补全成员信息，避免逐条串行 await 拖慢列表加载
    const visibleItems = content.liveList.filter(
      (item: any) => !hiddenMemberIds.value.includes(Number.parseInt(item.userInfo.userId)),
    )
    await Promise.all(visibleItems.map(async (item: any) => {
      item.cover = Tools.pictureUrls(item.coverPath)
      item.userInfo.teamLogo = Tools.pictureUrls(item.userInfo.teamLogo)
      item.date = Tools.dateFormat(Number.parseInt(item.ctime), 'yyyy-MM-dd hh:mm:ss')
      // 并行补全成员信息
      try {
        item.member = await window.mainAPI.getMember(item.userInfo.userId)
      }
      catch (e) {
        item.member = null
        console.error('获取成员信息失败:', e)
      }
    }))
    if (requestId !== listRequestId)
      return
    // 兜底去重，避免接口分页边界返回重复项导致列表出现重复卡片
    const existedIds = new Set(liveList.value.map((item: any) => item.liveId))
    liveList.value.push(...visibleItems.filter((item: any) => !existedIds.has(item.liveId)))
    loading.value = false
  }
  catch (error) {
    if (requestId !== listRequestId)
      return
    console.info(error)
    loading.value = false
  }
}

// 直播标签页
const activeName = ref('Home')
const liveTabs = ref<any[]>([])

// 从 localStorage 恢复标签页与激活页
onMounted(() => {
  const savedTabs = localStorage.getItem('liveTabs')
  if (savedTabs) {
    liveTabs.value = JSON.parse(savedTabs)
    const savedActive = localStorage.getItem('liveActiveName')
    if (savedActive && liveTabs.value.some((tab: any) => tab.name === savedActive)) {
      activeName.value = savedActive
    }
  }
})

// 监听标签页变化并保存到 localStorage
watch(liveTabs, (newTabs) => {
  localStorage.setItem('liveTabs', JSON.stringify(newTabs))
}, { deep: true })

// 监听激活页变化并保存到 localStorage
watch(activeName, (name) => {
  localStorage.setItem('liveActiveName', name)
})

function onTabRemove(targetName: string) {
  const wasActive = activeName.value === targetName
  liveTabs.value = liveTabs.value.filter((tab: any) => tab.name != targetName)
  // 仅当关闭的是当前激活的 tab 时才切回直播列表
  if (wasActive) {
    activeName.value = 'Home'
  }
}

// 修改播放方法
function play(item: any) {
  const exists = liveTabs.value.some((tab: any) => tab.liveId === item.liveId)
  if (exists) {
    const tab = liveTabs.value.find((tab: any) => tab.liveId === item.liveId)
    if (tab)
      activeName.value = tab.name
    return
  }

  const liveTab = {
    label: `${item.userInfo.nickname}的直播间`,
    title: item.title,
    liveId: item.liveId,
    name: `${item.liveId}_${Math.random().toString(36).substring(2)}`,
    liveType: item.liveType,
    liveMode: item.liveMode,
    startTime: Number.parseInt(item.ctime),
  }
  liveTabs.value.push(liveTab)
  activeName.value = liveTab.name
}

// 刷新
function refresh() {
  liveList.value = []
  liveNext.value = '0'
  noMore.value = false
  getLiveList()
}

/** 其他页面（如演出页）请求在本页打开一个开放公演播放 tab */
function openLiveTab(payload: any) {
  const exists = liveTabs.value.some((tab: any) => tab.liveId === payload.liveId)
  if (exists) {
    const tab = liveTabs.value.find((tab: any) => tab.liveId === payload.liveId)
    if (tab) {
      activeName.value = tab.name
    }
    return
  }

  const liveTab = {
    label: payload.title,
    title: payload.title,
    liveId: payload.liveId,
    name: `${payload.liveId}_${Math.random().toString(36).substring(2)}`,
    liveType: 1,
    liveMode: 0,
    startTime: payload.startTime,
    source: 'open',
    avatar: payload.avatar || '',
  }
  liveTabs.value.push(liveTab)
  activeName.value = liveTab.name
}

/** 从路由 query 读取演出页跳转参数并打开播放 tab（冷启动兜底），打开后立即清掉参数，防止刷新后重复打开 */
function openLiveFromQuery() {
  const liveId = route.query.openLiveId as string
  if (!liveId) {
    return
  }
  openLiveTab({
    liveId,
    title: (route.query.openTitle as string) || '开放公演',
    startTime: Number.parseInt(route.query.openStartTime as string) || Date.now(),
    avatar: (route.query.openAvatar as string) || '',
  })
  router.replace({ query: {} })
}

let openLiveTabHandler: any

// onMounted
onMounted(async () => {
  openLiveTabHandler = (payload: any) => openLiveTab(payload)
  EventBus.on('open-live-tab', openLiveTabHandler)
  // getLiveList 内部已调用 updateHiddenMemberIds，无需在此重复调用
  getLiveList()
  openLiveFromQuery()
})

// 已挂载时（keep-alive 复用），演出页再次跳转也能打开
watch(() => route.query.openLiveId, () => {
  openLiveFromQuery()
})

onUnmounted(() => {
  EventBus.off('open-live-tab', openLiveTabHandler)
})
</script>

<template>
  <div class="lives-root">
    <el-tabs v-model="activeName" @tab-remove="onTabRemove">
      <el-tab-pane label="直播列表" name="Home">
        <el-container>
          <el-header class="header-box">
            <span v-if="liveList.length > 0" class="live-count">已加载 {{ liveList.length }} 个直播</span>
            <el-button type="primary" :icon="Refresh" :loading="loading" @click="refresh">
              刷新
            </el-button>
          </el-header>
          <div v-loading="loading" class="live-main">
            <!-- 无直播时显示 -->
            <div v-if="!loading && liveList.length === 0" class="live-empty">
              <el-empty description="当前没有直播" />
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
          </div>
        </el-container>
      </el-tab-pane>

      <!-- 动态直播标签页 -->
      <el-tab-pane
        v-for="tab in liveTabs"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
        closable
      >
        <LivePlayer
          :active="activeName === tab.name"
          :live-title="tab.title"
          :live-id="tab.liveId"
          :start-time="tab.startTime"
          :live-type="tab.liveType"
          :live-mode="tab.liveMode"
          :source="tab.source || 'user'"
          :avatar-url="tab.avatar || ''"
          @close="onTabRemove(tab.name)"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.lives-root,
.el-tabs,
.el-tab-pane,
.el-container {
  height: 100%;
  overflow: hidden;
}

.header-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

/* 无数据时左侧计数被隐藏，用 margin-left:auto 把刷新按钮始终钉在右侧 */
.header-box .el-button {
  margin-left: auto;
}

.live-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.live-main {
  height: calc(100% - 60px);
  overflow: hidden;
}

.scrollbar-wrapper {
  height: 100%;
  overflow-x: hidden !important;
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
  /* 留出卡片悬停上浮与阴影的空间 */
  padding: 12px 16px 8px;
}

.live-item {
  min-width: 0;
}
</style>
