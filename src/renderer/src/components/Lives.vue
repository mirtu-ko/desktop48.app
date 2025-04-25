<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import RecordTask from '../assets/js/record-task'
import Tools from '../assets/js/tools'
import LiveItem from '../components/LiveItem.vue'

const liveList = ref<any[]>([])
const liveNext = ref('0')
const loading = ref(false)
const noMore = ref(false)
const router = useRouter()

const disabled = computed(() => loading.value || noMore.value)

const hiddenMemberIds = ref<number[]>([])

async function updateHiddenMemberIds() {
  const hiddenMembers = await window.mainAPI.getHiddenMembers()
  hiddenMemberIds.value = hiddenMembers.map((member: any) => member.userId)
}

onMounted(async () => {
  updateHiddenMemberIds()
})

const filteredLiveList = computed(() => {
  return liveList.value.filter((item: any) => {
    return !hiddenMemberIds.value.includes(Number(item.userInfo.userId))
  })
})

async function getLiveList() {
  console.log('[Lives.vue] getLiveList 方法开始执行')
  loading.value = true
  try {
    updateHiddenMemberIds()
    const content = await Apis.instance().lives(liveNext.value)
    console.log('获取到的直播列表:', content)
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

function refresh() {
  liveList.value = []
  liveNext.value = '0'
  noMore.value = false
  getLiveList()
}

function record(item: any) {
  Apis.instance().live(item.liveId).then(async (content) => {
    const member = await window.mainAPI.getMember(content.user.userId)
    const date = Tools.dateFormat(Number.parseInt(item.ctime), 'yyyyMMddhhmm')
    const filename = `${member.realName} ${date}_${Math.random().toString(36).substring(2)}.flv`
    const recordTask: RecordTask = new RecordTask(content.playStreamPath, filename, content.liveId)
    EventBus.emit('change-selected-menu', Constants.Menu.DOWNLOADS)
    router.push('/downloads')
    setTimeout(() => {
      recordTask.init()
      EventBus.emit('record-task', recordTask)
    })
  }).catch((error) => {
    console.error(error)
  })
}

// 调用Electron主进程暴露的openPlayer方法
function play(item: any) {
  Apis.instance().live(item.liveId).then(async (content) => {
    const params = {
      title: `${item.userInfo.nickname} ${item.title}`,
      streamPath: content.playStreamPath,
    }
    console.log('[lives.vue] 调用 openPlayer 参数:', params)
    try {
      const result = await window.mainAPI.openPlayer?.(params)
      console.log('[lives.vue] openPlayer 调用完成:', result)
    }
    catch (err) {
      ElMessage.error(`openPlayer 调用失败: ${(err as any)?.message || err}`)
      console.error('[lives.vue] openPlayer 错误:', err)
    }
  }).catch((error: any) => {
    ElMessage.error(error)
    console.error(error)
  })
}
</script>

<template>
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
          <div class="live-list-grid">
            <div v-for="item in filteredLiveList" :key="item.liveId" class="live-list-grid-item">
              <el-popover
                :ref="`popover-${item.liveId}`" placement="top" trigger="hover" :width="280"
                :fallback-placements="[]"
              >
                <p>{{ item.title }}</p>
                <div>
                  <el-button type="danger" size="small" @click="record(item)">
                    录制
                  </el-button>
                  <el-button type="success" size="small" @click="play(item)">
                    观看
                  </el-button>
                </div>
                <template #reference>
                  <LiveItem :item="item" class="live-card" />
                </template>
              </el-popover>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </el-container>
</template>

<style scoped lang="scss">
el-container {
  height: 100%;
  overflow: hidden;
}

.live-main {
  height: calc(100% - 70px);
  overflow: hidden;
}

.live-info {
  height: calc(100% - 150px);
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.live-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

:deep(.el-card__body) {
  padding: 6px !important;
}

:deep(.el-card__header) {
  padding: 12px !important;
}

.live-list-grid-item {
  max-width: 280px;
  min-height: 100px;
}
</style>
