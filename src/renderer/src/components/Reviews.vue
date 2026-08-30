<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import { onMounted, ref, watch } from 'vue'
import Apis from '../assets/js/apis'
import Tools from '../assets/js/tools'
import useFloatPlayers from '../assets/js/use-float-players'
import usePagedLiveList from '../assets/js/use-paged-live-list'
import FloatingDock from '../components/FloatingDock.vue'
import LiveItem from '../components/LiveItem.vue'

// 画中画迷你窗：回放播放挂载点与直播共用同一套
const { openReview } = useFloatPlayers()

const memberOption = ref<any[]>([])
// 级联筛选选中的路径：[groupId] / [groupId, teamId] / [groupId, teamId, userId]
const selectedFilter = ref<any[]>([])

// 分页列表状态/逻辑/触底加载统一由组合式函数管理，直播与回放共用同一套
const {
  list: reviewList,
  loading,
  noMore,
  scrollbarRef: reviewScrollRef,
  onInfiniteScroll,
  refresh,
} = usePagedLiveList({
  // 与旧版“成员/队伍/分团”单维度筛选一致：只发送被选中层级的对应参数，其余保持 '0'
  loadPage: (next) => {
    const params: {
      userId: string
      teamId: string
      groupId: string
      next: string
    } = {
      userId: '0',
      teamId: '0',
      groupId: '0',
      next,
    }
    const [groupId, teamId, userId] = selectedFilter.value || []
    if (userId != null)
      params.userId = String(userId)
    else if (teamId != null)
      params.teamId = String(teamId)
    else if (groupId != null)
      params.groupId = String(groupId)
    return Apis.instance().reviews(params)
  },
  processItem: async (item: any) => {
    item.cover = Tools.pictureUrls(item.coverPath)
    item.userInfo.teamLogo = Tools.pictureUrls(item.userInfo.teamLogo)
    item.member = await window.mainAPI.getMember(item.userInfo.userId)
    item.date = Tools.dateFormat(Number.parseFloat(item.ctime), 'yyyy-MM-dd hh:mm:ss')
  },
  stopOnError: true,
})

const whitespaceRegex = /\s+/g

function filterMethod(node: any, keyword: string) {
  const label = node.text || node.label
  const pinyin = node.data?.pinyin?.replace(whitespaceRegex, '') || ''
  const abbr = node.data?.abbr?.replace(whitespaceRegex, '') || ''
  const searchText = keyword.toLowerCase()
  return (
    (label && label.toLowerCase().includes(searchText))
    || (pinyin && pinyin.toLowerCase().includes(searchText))
    || (abbr && abbr.toLowerCase().includes(searchText))
  )
}

// 初始化
onMounted(async () => {
  memberOption.value = await window.mainAPI.getMemberTree()
  refresh()
})

// 点击回放：以画中画迷你窗打开，可边看边继续浏览列表
function onReviewClick(item: any) {
  openReview({
    liveId: item.liveId,
    nickname: item.userInfo.nickname,
    title: item.title,
    startTime: Number.parseInt(item.ctime),
  })
}

// 筛选内容变化（选中或清空）时自动触发查询，无需手动点刷新
watch(selectedFilter, () => {
  reviewScrollRef.value?.setScrollTop?.(0)
  refresh()
})
</script>

<template>
  <div class="reviews-root">
    <div class="review-container">
      <el-scrollbar
        ref="reviewScrollRef"
        v-loading="loading"
        class="scrollbar-wrapper"
        :distance="10"
        @end-reached="onInfiniteScroll"
      >
        <div v-if="reviewList.length === 0 && !loading" class="review-empty">
          暂无回放
        </div>
        <div v-if="reviewList.length > 0" class="review-list">
          <div
            v-for="item in reviewList" :key="item.liveId" class="review-item"
            @click="onReviewClick(item)"
          >
            <LiveItem :item="item" class="live-card" />
          </div>
        </div>
        <div v-if="noMore && reviewList.length > 0" class="list-end">
          没有更多回放了
        </div>
      </el-scrollbar>

      <!-- 右下角浮动筛选/刷新工具条：不占行，内容滚过时呈现磨砂玻璃 -->
      <FloatingDock>
        <el-cascader
          v-model="selectedFilter" transfer
          clearable placeholder="请选择团体/队伍/成员"
          filterable :filter-method="filterMethod" :options="memberOption" :props="{
            label: 'label',
            value: 'value',
            children: 'children',
            checkStrictly: true,
            checkOnClickNode: true,
            emitPath: true,
            multiple: false,
            expandTrigger: 'hover',
            lazy: false,
          }"
        />
        <el-button
          circle type="primary" :icon="Refresh" title="刷新"
          @click="refresh"
        />
      </FloatingDock>
    </div>
  </div>
</template>

<style scoped lang="scss">
.reviews-root,
.review-container {
  height: 100%;
  overflow: hidden;
}

.review-container {
  position: relative;
}

/* 筛选控件不压缩，避免窄窗口下按钮被挤掉文案 */
:deep(.el-select),
:deep(.filter-main),
:deep(.el-button) {
  flex-shrink: 0;
}

/* 筛选控件：圆角化、弱化生硬边框，与胶囊标签呼应 */
:deep(.el-select__wrapper),
:deep(.el-cascader .el-input__wrapper) {
  border-radius: 10px;
  background-color: color-mix(in srgb, var(--el-bg-color) 72%, transparent);
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
  transition:
    box-shadow 0.2s ease,
    background-color 0.2s ease;

  &:hover {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 55%, transparent) inset;
  }

  &.is-focused,
  &.is-focus {
    box-shadow: 0 0 0 1.5px var(--el-color-primary) inset;
  }
}

.scrollbar-wrapper {
  height: 100%;
  overflow-x: hidden !important;
}

/* 给列表底部留出浮动工具条的空间 */
:deep(.el-scrollbar__view) {
  padding-bottom: 88px;
}

.review-list {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  /* 顶部留出左上角 tab 栏，底留卡片悬停上浮与阴影的空间 */
  padding: 64px 16px 8px;
}

.review-item {
  cursor: pointer;
  min-width: 0;
}

.review-empty {
  padding: 120px 0;
  text-align: center;
  color: var(--el-text-color-placeholder);
}
</style>
