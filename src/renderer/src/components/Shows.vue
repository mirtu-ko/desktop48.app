<script setup lang="ts">
import type { OpenLive } from '../assets/js/apis'
import { Refresh } from '@element-plus/icons-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import Tools from '../assets/js/tools'
import useFloatPlayers from '../assets/js/use-float-players'
import useLoadMore from '../assets/js/use-load-more'
import FloatingDock from '../components/FloatingDock.vue'
import FloatingTabBar from '../components/FloatingTabBar.vue'
import ShowCard from '../components/ShowCard.vue'

const router = useRouter()

// 画中画迷你窗：与直播/回放页共用全局播放挂载点
const { openLive, openReview } = useFloatPlayers()

const showList = ref<OpenLive[]>([])
const next = ref('0')
const loading = ref(false)
/** 是否已无更多可加载（下一页游标为 0） */
const noMore = ref(false)
/** 历史公演（已结束可回放）：独立列表与翻页游标 */
const historyList = ref<OpenLive[]>([])
const historyNext = ref('0')
const historyLoading = ref(false)
const historyNoMore = ref(false)
/** 当前团体 groupId：0=全部 10=SNH 11=BEJ 12=GNZ 13=CKG 14=CGT */
const groupId = ref('0')

/** 团体切换 tab 选项（左上角浮动磨砂玻璃切换器）
 *  active 主题色：SNH=浅蓝 BEJ=粉红 GNZ=黄绿 CKG=琥珀，无主题色时回退品牌渐变 */
const groupTabs = [
  { label: '全部', key: '0', color: '' },
  { label: 'SNH48', key: '10', color: '#8FD3F6' },
  { label: 'BEJ48', key: '11', color: '#FE2472' },
  { label: 'GNZ48', key: '12', color: '#ABCA14' },
  { label: 'CKG48', key: '13', color: '#FFBA07' },
  { label: 'CGT48', key: '14', color: '#D21217' },
]

/** 触底加载禁用态：任一列表加载中、或两份列表都无更多时禁用 */
const disabled = computed(() =>
  loading.value || historyLoading.value || (noMore.value && historyNoMore.value))

const showsScrollRef = ref<any>(null)

// 统一的触底加载：直播/回放/公演三页共用同一套交互逻辑
// 最近的公演翻完后接着翻历史公演；historyNext 为 '0' 时拉首页（整体替换），否则追加
const { onInfiniteScroll } = useLoadMore({
  load: () => (noMore.value ? fetchHistoryShows(historyNext.value !== '0') : fetchShows(true)),
  disabled,
  scrollbarRef: showsScrollRef,
})

/** 加载失败的封面 liveId（空 URL 或 404 都走占位图） */
const brokenImages = ref(new Set<string>())

function markBroken(liveId: string) {
  brokenImages.value.add(liveId)
}

function isBroken(show: OpenLive): boolean {
  return !show.coverPath || brokenImages.value.has(show.liveId)
}

/** coverPath / teamLogo 可能是相对路径（如 /mediasource/...），统一补全为 source.48.cn 完整 URL */
function normalizeShowCovers(list: OpenLive[]) {
  list.forEach((item) => {
    if (item.coverPath) {
      item.coverPath = Tools.sourceUrl(item.coverPath)
    }
    item.teamList?.forEach((team) => {
      if (team.teamLogo) {
        team.teamLogo = Tools.sourceUrl(team.teamLogo)
      }
    })
  })
}

/** 获取开放公演列表（排期/进行中），按开演时间升序 */
async function fetchShows(append = false) {
  loading.value = true
  try {
    const content = await Apis.instance().openLives(Number.parseInt(groupId.value), next.value, false)
    const list: OpenLive[] = [...(content.liveList || [])]
      .sort((a, b) => Number.parseInt(a.stime) - Number.parseInt(b.stime))
    normalizeShowCovers(list)
    if (append) {
      showList.value.push(...list)
    }
    else {
      showList.value = list
    }
    next.value = content.next || '0'
    // getOpenLiveList 的 next 是"最后一场开演时间"游标：有数据时永远是时间戳，
    // 只有拉回空列表（或返回 '0'）才算没有更多，不能只靠 next === '0' 判断
    noMore.value = list.length === 0 || content.next === '0'
    console.log('获取演出信息成功:', showList.value)
  }
  catch (error) {
    console.error('获取演出信息失败:', error)
  }
  finally {
    loading.value = false
  }
}

/** 获取历史公演列表（record=true，已结束可回放），按开演时间降序（新→旧） */
async function fetchHistoryShows(append = false) {
  historyLoading.value = true
  try {
    const content = await Apis.instance().openLives(Number.parseInt(groupId.value), historyNext.value, true)
    const list: OpenLive[] = [...(content.liveList || [])]
      .sort((a, b) => Number.parseInt(b.stime) - Number.parseInt(a.stime))
    normalizeShowCovers(list)
    if (append) {
      historyList.value.push(...list)
    }
    else {
      historyList.value = list
    }
    historyNext.value = content.next || '0'
    // 与排期列表同理：next 为最后一场开演时间游标，拉回空列表才算没有更多
    historyNoMore.value = list.length === 0 || content.next === '0'
  }
  catch (error) {
    console.error('获取历史公演失败:', error)
  }
  finally {
    historyLoading.value = false
  }
}

onMounted(async () => {
  await fetchShows()
  // 首屏数据太少（不足一屏）时不会触发 end-reached，主动补拉下一页直到填满或无更多
  await onInfiniteScroll()
})

/** 刷新/切换团体共用：重置翻页游标后重新拉取，并回到列表顶部 */
async function reload() {
  next.value = '0'
  noMore.value = false
  historyList.value = []
  historyNext.value = '0'
  historyNoMore.value = false
  await fetchShows()
  showsScrollRef.value?.setScrollTop?.(0)
  await onInfiniteScroll()
}

/** 刷新按钮：重置分页后拉取最新列表 */
const refresh = reload

/** 切换团体：重置分页后重新拉取该团体公演 */
watch(groupId, reload)

/** 分组：当日开演 → “即将开始”，其余 → “最近公演” */
function isToday(stime: string): boolean {
  const d = new Date(Number.parseInt(stime))
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

const todayShows = computed(() => showList.value.filter(show => isToday(show.stime)))
const recentShows = computed(() => showList.value.filter(show => !isToday(show.stime)))

/** 进行中的公演：以画中画迷你窗直接打开直播，无需再经顶部 tab 中转 */
function openLiveStream(show: OpenLive) {
  if (show.status !== 2) {
    return
  }
  openLive({
    liveId: show.liveId,
    nickname: show.teamList?.[0]?.teamName || '',
    title: show.subTitle || show.title,
    startTime: Number.parseInt(show.stime),
    avatar: show.teamList?.[0]?.teamLogo || '',
    source: 'open',
    liveType: 1,
    liveMode: 0,
  })
  EventBus.emit('change-selected-menu', Constants.Menu.LIVES)
  router.push('/lives')
}

/** 历史公演（已结束）：以画中画回放迷你窗打开 VOD 流，停留当前页继续浏览 */
function openHistoryStream(show: OpenLive) {
  openReview({
    liveId: show.liveId,
    nickname: '',
    title: show.subTitle || show.title,
    startTime: Number.parseInt(show.stime),
    avatar: show.teamList?.[0]?.teamLogo || '',
    source: 'open',
    liveType: 1,
    liveMode: 0,
  })
}
</script>

<template>
  <div v-loading="loading || historyLoading" class="container">
    <!-- 左上角浮动团体切换：不占行，内容滚过时呈现磨砂玻璃 -->
    <FloatingTabBar :tabs="groupTabs" :active="groupId" @change="groupId = $event" />
    <div class="shows-main">
      <el-scrollbar
        ref="showsScrollRef"
        class="scrollbar-wrapper"
        :distance="10"
        @end-reached="onInfiniteScroll"
      >
        <div class="shows-container">
          <template v-if="todayShows.length">
            <h2>即将开始</h2>
            <div class="shows-list">
              <div
                v-for="show in todayShows"
                :key="show.liveId"
                class="show-item"
                :class="{ clickable: show.status === 2 }"
                @click="openLiveStream(show)"
              >
                <ShowCard :show="show" :is-broken="isBroken" @mark-broken="markBroken" />
              </div>
            </div>
          </template>

          <template v-if="recentShows.length">
            <h2>最近公演</h2>
            <div class="shows-list">
              <div
                v-for="show in recentShows"
                :key="show.liveId"
                class="show-item"
                :class="{ clickable: show.status === 2 }"
                @click="openLiveStream(show)"
              >
                <ShowCard :show="show" :is-broken="isBroken" @mark-broken="markBroken" />
              </div>
            </div>
          </template>

          <template v-if="historyList.length">
            <h2>历史公演</h2>
            <div class="shows-list">
              <div
                v-for="show in historyList"
                :key="show.liveId"
                class="show-item clickable"
                @click="openHistoryStream(show)"
              >
                <ShowCard :show="show" :is-broken="isBroken" @mark-broken="markBroken" />
              </div>
            </div>
          </template>

          <el-empty
            v-if="!showList.length && !historyList.length && !loading && !historyLoading"
            class="shows-empty"
            :image-size="120"
            description="暂无演出信息，换个团体看看吧"
          />
        </div>
        <div v-if="noMore && historyNoMore" class="list-end">
          没有更多公演了
        </div>
      </el-scrollbar>
    </div>
    <!-- 右下角浮动操作条：磨砂玻璃 dock 衬托刷新按钮，空数据时也可用 -->
    <FloatingDock>
      <el-button
        circle
        type="primary"
        :icon="Refresh"
        :loading="loading || historyLoading"
        title="刷新"
        @click="refresh"
      />
    </FloatingDock>
  </div>
</template>

<style scoped>
.container {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.shows-main {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.shows-container {
  /* 顶部留出左上角浮动切换器的空间，避免遮挡内容 */
  padding: 72px 10px 12px;

  h2 {
    margin: 14px 4px 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

/* 给列表底部留出右下角浮动刷新按钮的空间 */
:deep(.el-scrollbar__view) {
  padding-bottom: 88px;
}

.scrollbar-wrapper {
  height: 100%;
  overflow-x: hidden !important;
}

.shows-list {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.show-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
  transition:
    transform 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out;
}

.show-item.clickable {
  cursor: pointer;
}

.show-item.clickable:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(31, 35, 70, 0.12);
}

/* 空态：竖直居中，视觉上与浮动切换器保持对称 */
.shows-empty {
  padding: 80px 0 0;
}

.shows-empty :deep(.el-empty__description p) {
  color: var(--el-text-color-secondary);
}
</style>
