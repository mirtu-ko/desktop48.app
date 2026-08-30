<script setup lang="ts">
import type { OpenLive } from '../assets/js/apis'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import Tools from '../assets/js/tools'
import useLoadMore from '../assets/js/use-load-more'
import ShowCard from '../components/ShowCard.vue'

const router = useRouter()

const showList = ref<OpenLive[]>([])
const next = ref('0')
const loading = ref(false)
/** 是否已无更多可加载（下一页游标为 0） */
const noMore = ref(false)
/** 当前团体 groupId：0=全部 10=SNH 11=BEJ 12=GNZ 13=CKG 14=CGT */
const groupId = ref('0')

const disabled = computed(() => loading.value || noMore.value)

const showsScrollRef = ref<any>(null)

// 统一的触底加载：直播/回放/公演三页共用同一套交互逻辑
const { onInfiniteScroll } = useLoadMore({
  load: () => fetchShows(true),
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

/** 获取开放公演列表（排期/进行中），按开演时间升序 */
async function fetchShows(append = false) {
  loading.value = true
  try {
    const content = await Apis.instance().openLives(Number.parseInt(groupId.value), next.value, false)
    const list: OpenLive[] = [...(content.liveList || [])]
      .sort((a, b) => Number.parseInt(a.stime) - Number.parseInt(b.stime))
    // coverPath / teamLogo 可能是相对路径（如 /mediasource/...），统一补全为 source.48.cn 完整 URL
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

onMounted(async () => {
  await fetchShows()
  // 首屏数据太少（不足一屏）时不会触发 end-reached，主动补拉下一页直到填满或无更多
  await onInfiniteScroll()
})

/** 切换团体：重置翻页游标后重新拉取，并回到列表顶部 */
watch(groupId, async () => {
  next.value = '0'
  noMore.value = false
  await fetchShows()
  showsScrollRef.value?.setScrollTop?.(0)
  await onInfiniteScroll()
})

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

/** 进行中的公演：双通道打开直播 tab——事件给已挂载的 Lives（即时、可重复点同一场），query 兜底冷启动 */
function openLiveStream(show: OpenLive) {
  if (show.status !== 2) {
    return
  }
  EventBus.emit('open-live-tab', {
    liveId: show.liveId,
    title: show.subTitle || show.title,
    startTime: Number.parseInt(show.stime),
    avatar: show.teamList?.[0]?.teamLogo || '',
  })
  EventBus.emit('change-selected-menu', Constants.Menu.LIVES)
  router.push({
    path: '/lives',
    query: {
      openLiveId: show.liveId,
      openTitle: show.subTitle || show.title,
      openStartTime: String(Number.parseInt(show.stime)),
      openAvatar: show.teamList?.[0]?.teamLogo || '',
    },
  })
}
</script>

<template>
  <div v-loading="loading" class="container">
    <el-tabs v-model="groupId">
      <el-tab-pane label="全部" name="0" />
      <el-tab-pane label="SNH48" name="10" />
      <el-tab-pane label="BEJ48" name="11" />
      <el-tab-pane label="GNZ48" name="12" />
      <el-tab-pane label="CKG48" name="13" />
      <el-tab-pane label="CGT48" name="14" />
    </el-tabs>
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

          <div v-if="!showList.length && !loading">
            <p>暂无演出信息</p>
          </div>
        </div>
        <div v-if="noMore" class="list-end">
          没有更多公演了
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style scoped>
.container {
  height: 100%;
  overflow: hidden;
}

.shows-main {
  height: calc(100% - 60px);
  overflow: hidden;
}

.shows-container {
  padding: 8px 10px 12px;

  h2 {
    margin: 14px 4px 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
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
</style>
