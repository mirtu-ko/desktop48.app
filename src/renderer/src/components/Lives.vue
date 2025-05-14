<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Apis from '../assets/js/apis'
import Tools from '../assets/js/tools'
import LiveItem from '../components/LiveItem.vue'
import LivePlayer from '../components/LivePlayer.vue'

const liveList = ref<any[]>([])
const liveNext = ref('0')
const loading = ref(false)
const noMore = ref(false)

const disabled = computed(() => loading.value || noMore.value)

// 更新隐藏的成员ID
const hiddenMemberIds = ref<number[]>([])

async function updateHiddenMemberIds() {
  const hiddenMembers = await window.mainAPI.getHiddenMembers()
  hiddenMemberIds.value = hiddenMembers.map((member: any) => member.userId)
}

onMounted(async () => {
  updateHiddenMemberIds()
})

// 加载更多
async function getLiveList() {
  // console.log('[Lives.vue] getLiveList 方法开始执行')
  loading.value = true
  try {
    updateHiddenMemberIds()
    const content = await Apis.instance().lives(liveNext.value)
    // console.log('获取到的直播列表:', content)
    if (noMore.value) {
      ElMessage({
        message: '加载完毕',
        type: 'info',
      })
      noMore.value = true
      loading.value = false
      return
    }
    if (content.next === '0') {
      noMore.value = true
    }
    liveNext.value = content.next
    for (const item of content.liveList) {
      if (hiddenMemberIds.value.includes(Number.parseInt(item.userInfo.userId)))
        continue
      item.cover = Tools.pictureUrls(item.coverPath)
      item.userInfo.teamLogo = Tools.pictureUrls(item.userInfo.teamLogo)
      item.isReview = true
      item.date = Tools.dateFormat(Number.parseInt(item.ctime), 'yyyy-MM-dd hh:mm:ss')
      // 异步补全成员信息
      try {
        item.member = await window.mainAPI.getMember(item.userInfo.userId)
      }
      catch (e) {
        item.member = null
        console.error('获取成员信息失败:', e)
      }
      liveList.value.push(item)
    }
    loading.value = false
  }
  catch (error) {
    console.info(error)
    loading.value = false
  }
}

onMounted(() => {
  getLiveList()
})

// 刷新
function refresh() {
  liveList.value = []
  liveNext.value = '0'
  noMore.value = false
  getLiveList()
}

// // 调用Electron主进程暴露的openPlayer方法
// function play(item: any) {
//   Apis.instance().live(item.liveId).then(async (content) => {
//     const params = {
//       title: `${item.userInfo.nickname} ${item.title}`,
//       streamPath: content.playStreamPath,
//     }
//     console.log('[lives.vue] 调用 openPlayer 参数:', params)
//     try {
//       const result = await window.mainAPI.openPlayer?.(params)
//       console.log('[lives.vue] openPlayer 调用完成:', result)
//     }
//     catch (err) {
//       ElMessage.error(`openPlayer 调用失败: ${(err as any)?.message || err}`)
//       console.error('[lives.vue] openPlayer 错误:', err)
//     }
//   }).catch((error: any) => {
//     ElMessage.error(error)
//     console.error(error)
//   })
// }

// 直播标签页
const activeName = ref('Home')
const liveTabs = ref<any[]>([])

// 从 localStorage 恢复标签页
onMounted(() => {
  const savedTabs = localStorage.getItem('liveTabs')
  if (savedTabs) {
    liveTabs.value = JSON.parse(savedTabs)
  }
})

// 监听标签页变化并保存到 localStorage
watch(liveTabs, (newTabs) => {
  localStorage.setItem('liveTabs', JSON.stringify(newTabs))
}, { deep: true })

// 在组件卸载时清理数据
onUnmounted(() => {
  localStorage.removeItem('liveTabs')
})

function onTabRemove(targetName: string) {
  activeName.value = 'Home'
  liveTabs.value = liveTabs.value.filter((tab: any) => tab.name != targetName)
}

// 修改播放方法
function play(item: any) {
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
</script>

<template>
  <div class="lives-root">
    <el-tabs v-model="activeName" @tab-remove="onTabRemove">
      <el-tab-pane label="直播列表" name="Home">
        <el-container>
          <el-header class="header-box">
            <el-button type="primary" @click="refresh">
              刷新
            </el-button>
          </el-header>
          <div v-loading="loading" class="live-main">
            <!-- 无直播时显示 -->
            <div v-if="!loading && liveList.length === 0" class="live-info">
              当前没有直播
            </div>

            <!-- 有直播时显示 -->
            <el-scrollbar v-if="!loading && liveList.length > 0" class="scrollbar-wrapper">
              <div
                v-infinite-scroll="getLiveList"
                :infinite-scroll-disabled="disabled"
                infinite-scroll-delay="100"
                infinite-scroll-distance="20"
                class="live-main"
              >
                <div class="live-list">
                  <div v-for="item in liveList" :key="item.liveId" class="live-item" @click="play(item)">
                    <LiveItem :item="item" class="live-card" />
                  </div>
                </div>
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
          :live-title="tab.title"
          :live-id="tab.liveId"
          :start-time="tab.startTime"
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

.live-main {
  height: calc(100% - 60px);
  overflow: hidden;
}

.scrollbar-wrapper {
  height: 100%;
  overflow-x: hidden !important;
}
.live-info {
  height: calc(100% - 150px);
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.live-list {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 0.3fr));
}

:deep(.el-card__body) {
  padding: 6px !important;
}

:deep(.el-card__header) {
  padding: 8px !important;
}

.live-item {
  overflow: hidden;
  background: #fff;
}
</style>
