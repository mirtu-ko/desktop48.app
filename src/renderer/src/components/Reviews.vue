<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import { computed, onMounted, ref, watch } from 'vue'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import Tools from '../assets/js/tools'
import useLoadMore from '../assets/js/use-load-more'
import LiveItem from '../components/LiveItem.vue'
import ReviewPlayer from './ReviewPlayer.vue'

// 响应式变量
const activeName = ref('Home')
const reviewTabs = ref<any[]>([])
const reviewList = ref<any[]>([])
const reviewNext = ref('0')
const loading = ref(false)
const noMore = ref(false)
const reviewScreen = ref(Constants.REVIEW_SCREEN.USER)
const selectedUser = ref<any[]>([])
const selectedTeam = ref<any[]>([])
const selectedGroup = ref<any[]>([])

const memberOption = ref<any[]>([])
const hiddenMemberIds = ref<number[]>([])

async function updateHiddenMemberIds() {
  const hiddenMembers = await window.mainAPI.getHiddenMembers()
  hiddenMemberIds.value = hiddenMembers.map((member: any) => member.userId)
}

const teamOptions = ref<any[]>([])
const groupOptions = ref<any[]>([])
const whitespaceRegex = /\s+/g

function filterMethod(node: any, keyword: string) {
  const label = node.text || node.label
  const pinyin = node.data?.pinyin.replace(whitespaceRegex, '') || ''
  const abbr = node.data?.abbr.replace(whitespaceRegex, '') || ''
  const searchText = keyword.toLowerCase()
  return (
    (label && label.toLowerCase().includes(searchText))
    || (pinyin && pinyin.toLowerCase().includes(searchText))
    || (abbr && abbr.toLowerCase().includes(searchText))
  )
}

// 初始化
onMounted(async () => {
  teamOptions.value = await window.mainAPI.getTeamOptions()
  groupOptions.value = await window.mainAPI.getGroupOptions()
  memberOption.value = await window.mainAPI.getMemberTree()
  console.log('memberOption.value', memberOption.value)
  updateHiddenMemberIds()
  getReviewList()
  // 从 localStorage 中加载标签页数据
  const savedTabs = localStorage.getItem('reviewTabs')
  if (savedTabs) {
    reviewTabs.value = JSON.parse(savedTabs)
  }
})

// 获取录播列表
const disabled = computed(() => loading.value || noMore.value)

const reviewScrollRef = ref<any>(null)

// 统一的触底加载：直播/回放/公演三页共用同一套交互逻辑
const { onInfiniteScroll } = useLoadMore({
  load: getReviewList,
  disabled,
  scrollbarRef: reviewScrollRef,
})

// 列表请求序号，用于丢弃过期响应，避免刷新/滚动并发时数据错乱
let listRequestId = 0

async function getReviewList() {
  const requestId = ++listRequestId
  const params: {
    userId: string
    teamId: string
    groupId: string
    next: string
  } = {
    userId: '0',
    teamId: '0',
    groupId: '0',
    next: reviewNext.value,
  }
  switch (reviewScreen.value) {
    case Constants.REVIEW_SCREEN.USER:
      params.userId = selectedUser.value?.[2]
      break
    case Constants.REVIEW_SCREEN.TEAM:
      params.teamId = selectedTeam.value?.[0]
      break
    case Constants.REVIEW_SCREEN.GROUP:
      params.groupId = selectedGroup.value?.[0]
      break
    default:
      break
  }
  loading.value = true
  try {
    await updateHiddenMemberIds()
    if (requestId !== listRequestId)
      return
    const content = await Apis.instance().reviews(params)
    if (requestId !== listRequestId)
      return
    if (!content || !Array.isArray(content.liveList)) {
      console.warn('liveList 不是数组或无内容', content?.liveList)
      noMore.value = true
      return
    }
    if (content.next == '0' || content.liveList.length === 0) {
      noMore.value = true
    }
    reviewNext.value = content.next

    // 过滤被屏蔽成员，并行补全成员信息，避免逐条串行 await 拖慢列表加载
    const visibleItems = content.liveList.filter(
      (item: any) => !hiddenMemberIds.value.includes(Number.parseInt(item.userInfo.userId)),
    )
    await Promise.all(visibleItems.map(async (item: any) => {
      item.cover = Tools.pictureUrls(item.coverPath)
      item.userInfo.teamLogo = Tools.pictureUrls(item.userInfo.teamLogo)
      item.member = await window.mainAPI.getMember(item.userInfo.userId)
      item.date = Tools.dateFormat(Number.parseFloat(item.ctime), 'yyyy-MM-dd hh:mm:ss')
    }))
    if (requestId !== listRequestId)
      return
    // 兜底去重，避免接口分页边界返回重复项导致列表出现重复卡片
    const existedIds = new Set(reviewList.value.map((item: any) => item.liveId))
    reviewList.value.push(...visibleItems.filter((item: any) => !existedIds.has(item.liveId)))
  }
  catch (error) {
    if (requestId !== listRequestId)
      return
    console.info(error)
    noMore.value = true
  }
  finally {
    loading.value = false
  }
}

// 点击回放
function onReviewClick(item: any) {
  // 该回放已经打开过就直接切到对应标签页，不再重复创建
  const openedTab = reviewTabs.value.find((tab: any) => tab.liveId === item.liveId)
  if (openedTab) {
    activeName.value = openedTab.name
    return
  }
  const liveTab = {
    label: `${item.userInfo.nickname}的直播间`,
    title: item.title,
    liveId: item.liveId,
    name: `${item.liveId}_${Math.random().toString(36).substring(2)}`,
    startTime: Number.parseInt(item.ctime),
  }
  reviewTabs.value.push(liveTab)
  activeName.value = liveTab.name
}

function onTabRemove(targetName: string) {
  activeName.value = 'Home'
  reviewTabs.value = reviewTabs.value.filter((tab: any) => tab.name != targetName)
}

// 监听标签页变化并保存到 localStorage
watch(reviewTabs, (newTabs: any) => {
  console.log('标签页变化', newTabs)
  localStorage.setItem('reviewTabs', JSON.stringify(newTabs))
}, {
  deep: true,
})

// 刷新
function refresh() {
  reviewList.value = []
  reviewNext.value = '0'
  noMore.value = false
  getReviewList()
}
</script>

<template>
  <div class="reviews-root">
    <el-tabs v-model="activeName" @tab-remove="onTabRemove">
      <el-tab-pane label="回放列表" name="Home">
        <div class="review-container">
          <el-header class="header-box">
            <el-select v-model="reviewScreen" style="width: 100px;">
              <el-option :value="Constants.REVIEW_SCREEN.USER" label="成员" />
              <el-option :value="Constants.REVIEW_SCREEN.TEAM" label="队伍" />
              <el-option :value="Constants.REVIEW_SCREEN.GROUP" label="分团" />
            </el-select>
            <div style="margin-left: 8px;">
              <el-cascader
                v-if="reviewScreen === Constants.REVIEW_SCREEN.USER" v-model="selectedUser" transfer
                style="width: 320px;" clearable placeholder="请选择成员" filterable :filter-method="filterMethod" :options="memberOption" :props="{
                  label: 'label',
                  value: 'value',
                  children: 'children',
                  checkStrictly: false,
                  emitPath: true,
                  multiple: false,
                  expandTrigger: 'hover',
                  lazy: false,
                }"
              />

              <el-cascader
                v-if="reviewScreen === Constants.REVIEW_SCREEN.TEAM" v-model="selectedTeam" transfer
                placeholder="请选择队伍" clearable filterable :options="teamOptions"
              />

              <el-cascader
                v-if="reviewScreen === Constants.REVIEW_SCREEN.GROUP" v-model="selectedGroup" transfer
                placeholder="请选择分团" clearable filterable :options="groupOptions"
              />
            </div>
            <el-button style="margin-left: 8px;" :icon="Refresh" type="primary" @click="refresh">
              刷新
            </el-button>
          </el-header>

          <div v-if="reviewList.length === 0 && !loading" class="review-empty">
            暂无回放
          </div>
          <el-scrollbar
            ref="reviewScrollRef"
            v-loading="loading"
            class="scrollbar-wrapper"
            :distance="10"
            @end-reached="onInfiniteScroll"
          >
            <div class="review-list">
              <div
                v-for="item in reviewList" :key="item.liveId" class="review-item"
                @click="onReviewClick(item)"
              >
                <LiveItem :item="item" class="live-card" />
              </div>
            </div>
            <div v-if="noMore" class="list-end">
              没有更多回放了
            </div>
          </el-scrollbar>
        </div>
      </el-tab-pane>

      <el-tab-pane
        v-for="reviewTab in reviewTabs" :key="reviewTab.name" closable :label="reviewTab.label"
        :name="reviewTab.name"
      >
        <ReviewPlayer
          :live-id="reviewTab.liveId" :start-time="reviewTab.startTime" :live-title="reviewTab.title"
          :active="activeName === reviewTab.name"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.reviews-root,
.el-tabs,
.el-tab-pane,
.review-container {
  height: 100%;
  overflow: hidden;
}

/* el-tabs 内部的内容容器默认是 auto 高度，会断开高度链，
   导致标签页里的播放器拿不到可用高度 */
:deep(.el-tabs) {
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.header-box {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 12px;
  width: 100%;
}

.scrollbar-wrapper {
  height: calc(100% - 60px);
  overflow-x: hidden !important;
}

.review-list {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  /* 留出卡片悬停上浮与阴影的空间 */
  padding: 12px 16px 8px;
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
