<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import Tools from '../assets/js/tools'
import LiveItem from '../components/LiveItem.vue'
import Review from '../components/Review.vue'

// 响应式变量
const activeName = ref('Home')
const liveTabs = ref<any[]>([])
const reviewList = ref<any[]>([])
const reviewNext = ref('0')
const loading = ref(false)
const noMore = ref(false)
const reviewScreen = ref(Constants.REVIEW_SCREEN.USER)
const selectedUser = ref<any[]>([])
const selectedTeam = ref<any[]>([])
const selectedGroup = ref<any[]>([])

const members = ref<any[]>([])
const hiddenMemberIds = ref<number[]>([])

async function updateHiddenMemberIds() {
  const hiddenMembers = await window.mainAPI.getHiddenMembers()
  hiddenMemberIds.value = hiddenMembers.map((member: any) => member.userId)
}

const teamOptions = ref<any[]>([])
const groupOptions = ref<any[]>([])

onMounted(async () => {
  teamOptions.value = await window.mainAPI.getTeamOptions()
  groupOptions.value = await window.mainAPI.getGroupOptions()
  members.value = await window.mainAPI.getMemberTree()
  updateHiddenMemberIds()
})

const disabled = computed(() => loading.value || noMore.value)

async function getReviewList() {
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
  params.next = reviewNext.value
  loading.value = true
  updateHiddenMemberIds()
  Apis.instance().reviews(params).then(async (content: any) => {
    if (!content || !Array.isArray(content.liveList)) {
      console.warn('liveList 不是数组或无内容', content?.liveList)
      noMore.value = true
      loading.value = false
      return
    }
    if (noMore.value) {
      ElMessage({
        message: '加载完毕',
        type: 'info',
      })
      noMore.value = true
      loading.value = false
      return
    }
    if (content.next == '0' || content.liveList.length === 0) {
      noMore.value = true
    }
    reviewNext.value = content.next
    for (const item of content.liveList) {
      if (hiddenMemberIds.value.includes(Number.parseInt(item.userInfo.userId)))
        continue
      item.cover = Tools.pictureUrls(item.coverPath)
      item.userInfo.teamLogo = Tools.pictureUrls(item.userInfo.teamLogo)
      item.isReview = true
      item.member = await window.mainAPI.getMember(item.userInfo.userId)
      item.team = item.member?.teamName || ''
      item.date = Tools.dateFormat(Number.parseFloat(item.ctime), 'yyyy-MM-dd hh:mm:ss')
      reviewList.value.push(item)
      // console.log('当前列表长度:', reviewList.value.length)
    }
    loading.value = false
  }).catch((error: any) => {
    console.info(error)
    noMore.value = true
    loading.value = false
  })
}

// 刷新
function refresh() {
  reviewList.value = []
  reviewNext.value = '0'
  noMore.value = false
  getReviewList()
}

// 点击回放
function onReviewClick(item: any) {
  const exists = liveTabs.value.some((tab: any) => tab.liveId === item.liveId)
  if (exists)
    return
  const liveTab = {
    label: `${item.userInfo.nickname}的直播间`,
    title: item.title,
    liveId: item.liveId,
    name: `${item.liveId}_${Math.random().toString(36).substring(2)}`,
    startTime: Number.parseInt(item.ctime),
  }
  liveTabs.value.push(liveTab)
  activeName.value = liveTab.name
}

function onTabRemove(targetName: string) {
  activeName.value = 'Home'
  liveTabs.value = liveTabs.value.filter((tab: any) => tab.name != targetName)
}

// 初始化
onMounted(() => {
  getReviewList()
})

// 加载更多
const isLoadingMore = ref(false)

async function onInfiniteScroll() {
  console.log('触发加载更多', {
    isLoadingMore: isLoadingMore.value,
    loading: loading.value,
    noMore: noMore.value,
  })
  if (isLoadingMore.value || loading.value || noMore.value)
    return
  isLoadingMore.value = true
  try {
    await getReviewList()
  }
  finally {
    isLoadingMore.value = false
  }
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
                style="width: 320px;" clearable placeholder="请选择成员" filterable :options="members" :props="{
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
            <el-button style="margin-left: 8px;" type="primary" @click="refresh">
              刷新
            </el-button>
          </el-header>

          <div v-if="reviewList.length === 0 && !loading" style="text-align:center; color:#999; padding:120px 0;">
            暂无回放
          </div>
          <el-scrollbar
            wrap-class="scrollbar-wrapper"
          >
            <div
              v-loading="loading" v-infinite-scroll="onInfiniteScroll" class="review-main"
              :infinite-scroll-disabled="disabled"
              infinite-scroll-delay="100"
              infinite-scroll-distance="20"
            >
              <div class="review-list">
                <div
                  v-for="item in reviewList" :key="item.liveId" class="review-item"
                  @click="onReviewClick(item)"
                >
                  <LiveItem :item="item" class="live-card" />
                </div>
              </div>
              <div v-if="isLoadingMore" class="loading-more-tip">
                正在加载更多...
              </div>
            </div>
          </el-scrollbar>
        </div>
      </el-tab-pane>

      <el-tab-pane
        v-for="liveTab in liveTabs" :key="liveTab.name" closable :label="liveTab.label"
        :name="liveTab.name"
        @close="onTabRemove(liveTab.name)"
      >
        <Review :live-id="liveTab.liveId" :start-time="liveTab.startTime" :live-title="liveTab.title" />
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

.header-box {
  display: flex;
  align-items: right;
  justify-content: right;
  padding: 12px;
  width: 100%;
}

.scrollbar-wrapper {
  height: calc(100% - 60px);
  overflow-x: hidden !important;
}

.review-list {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 0.3fr));
}

.review-item {
  cursor: pointer;
}

.loading-more-tip {
  text-align: center;
  color: #888;
  padding: 12px 0 16px 0;
  font-size: 14px;
}

:deep(.el-card__body) {
  padding: 6px !important;
}

:deep(.el-card__header) {
  padding: 8px !important;
}

html,
body,
#app {
  height: 100%;
  overflow: hidden;
}
</style>
