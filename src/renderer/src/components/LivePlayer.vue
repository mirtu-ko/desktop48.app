<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'

import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import RecordTask from '../assets/js/record-task'
import Tools from '../assets/js/tools' // 添加手动卸载标记

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
  startTime: { type: Number, required: true },
})

const realName = ref('')
const userAvatar = ref('')

const playStreamPath = ref('')
const nativeVideo = ref<HTMLVideoElement | null>(null)
const streamId = ref('')
const loading = ref(true)
const retryCount = ref(0)
const maxRetries = 3
const isManuallyUnmounted = ref(false)
const router = useRouter()

// 封面图片
const isRadio = ref(false)
const coverImage = ref('')
// const carousels = ref<string[]>([])
// const carouselTime = ref(5000)

// 获取直播信息
function getOne() {
  loading.value = true
  retryCount.value = 0 // 重置重试计数
  Apis.instance().live(props.liveId).then((data) => {
    console.log('获取到的直播信息:', data)
    startHlsStream(data.playStreamPath)
    isRadio.value = data.isRadio
    coverImage.value = Tools.sourceUrl(data.coverPath)
    realName.value = data.user.userName
    userAvatar.value = Tools.sourceUrl(data.user.userAvatar)
  }).catch((error: any) => {
    console.error(error)
    ElMessage.error('获取直播信息失败')
    loading.value = false
  })
}

// 定时更新直播onlineNum
const onlineNum = ref(0)
const onlineNumTimer = ref()

// 启动定时器
function startOnlineNumTimer() {
  onlineNumTimer.value = setInterval(() => {
    updateOnlineNum()
  }, 15000)
}

// 停止定时器
function stopOnlineNumTimer() {
  if (onlineNumTimer.value) {
    clearInterval(onlineNumTimer.value)
    onlineNumTimer.value = null
  }
}

function updateOnlineNum() {
  Apis.instance().live(props.liveId).then((data) => {
    console.log('获取到的直播在线人数:', data.onlineNum)
    onlineNum.value = data.onlineNum
  }).catch((error: any) => {
    console.error(error)
  })
}

startOnlineNumTimer()

// 启动 HLS 流
function startHlsStream(rtmpUrl: string) {
  window.mainAPI.convertToHls(rtmpUrl, props.liveId).then((result) => {
    console.log('转换后的 HLS 流地址:', result)
    playStreamPath.value = result.url
    streamId.value = result.liveId
  }).catch((error) => {
    console.error('转换直播流失败:', error)
    ElMessage.error('转换直播流失败')
    loading.value = false
  })
}

// 处理流错误和重试
function handleStreamError() {
  // 如果是手动卸载，不进行重试
  if (isManuallyUnmounted.value) {
    console.log('[LivePlayer.vue] 组件手动卸载，不进行重试')
    return
  }

  if (retryCount.value < maxRetries) {
    retryCount.value++
    console.log(`[LivePlayer.vue] 直播流中断，正在进行第 ${retryCount.value} 次重试`)
    loading.value = true
    setTimeout(() => {
      getOne()
    }, 2000)
  }
  else {
    console.log('[LivePlayer.vue] 重试次数已达上限，停止播放')
    loading.value = false
    ElMessage.warning('直播已结束')
    // 清理资源
    if (streamId.value) {
      window.mainAPI.stopHlsConvert(streamId.value).catch((err) => {
        console.error('停止转码失败:', err)
      })
    }
  }
}

// 添加阻止休眠
const powerSaveBlockerId = ref<number | null>(null)
onMounted(async () => {
  powerSaveBlockerId.value = await window.mainAPI.preventSleep()
})

onMounted(() => {
  console.log('[LivePlayer.vue] onMounted', props)
  getOne()
  watch(
    () => playStreamPath.value,
    (newPath) => {
      if (nativeVideo.value && newPath) {
        if (Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource(newPath)
          hls.attachMedia(nativeVideo.value)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            loading.value = false
          })

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (isManuallyUnmounted.value) {
              hls.destroy()
              console.log('[LivePlayer.vue] 组件手动卸载，不进行重试')
              return
            }
            console.error('[LivePlayer.vue] HLS 错误:', data)
            if (data.fatal) {
              loading.value = false
              handleStreamError()
            }
            if (data.type === 'networkError') {
              loading.value = true
              console.log('[LivePlayer.vue] 网络错误，正在重试')
              handleStreamError()
            }
          })
        }
        else if (nativeVideo.value.canPlayType('application/vnd.apple.mpegurl')) {
          nativeVideo.value.src = newPath
          nativeVideo.value.oncanplay = () => {
            loading.value = false
          }
          nativeVideo.value.onerror = () => {
            loading.value = false
            handleStreamError()
          }
        }
      }
    },
    { immediate: true },
  )
})

// 检查下载目录是否存在
function checkDownloadDirectory() {
  window.mainAPI.getConfig('downloadDirectory').then((result: any) => {
    if (!result) {
      ElMessage({
        message: '下载目录不存在，请先配置下载目录',
        type: 'warning',
      })
      router.push('/setting')
    }
  }).catch((error: any) => {
    console.error(error)
    ElMessage({ message: '检查下载目录失败', type: 'error' })
  })
}

// 调用Electron主进程暴露的record方法
function record() {
  checkDownloadDirectory()
  Apis.instance().live(props.liveId).then(async (content) => {
    const date = Tools.dateFormat(Number.parseInt(String(props.startTime)), 'yyyyMMddhhmm')
    const filename = `${realName.value} ${date}.flv`
    const recordTask: RecordTask = new RecordTask(content.playStreamPath, filename, content.liveId)
    EventBus.emit('change-selected-menu', Constants.Menu.DOWNLOADS)
    router.push('/downloads')
    setTimeout(() => {
      // console.log('[LivePlayer.vue] 调用 record 参数:', recordTask)
      recordTask.init()
      EventBus.emit('record-task', recordTask)
    })
  }).catch((error) => {
    console.error(error)
  })
}

onUnmounted(() => {
  console.log('[LivePlayer.vue] onUnmounted')
  isManuallyUnmounted.value = true // 设置手动卸载标记
  // 停止 HLS 转码
  if (streamId.value) {
    window.mainAPI.stopHlsConvert(streamId.value).catch((err) => {
      console.error('停止转码失败:', err)
    })
  }
  // 移除阻止休眠
  if (powerSaveBlockerId.value !== null) {
    window.mainAPI.allowSleep(powerSaveBlockerId.value)
  }
  // 清理定时器
  stopOnlineNumTimer()
})
</script>

<template>
  <el-header class="header-box">
    <div style="display: flex; align-items: center; width: 100%;">
      <img :src="userAvatar" alt="Logo" style="width: 32px; height: 32px; margin-right: 12px; border-radius: 50%;">
      <span
        style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 12px;"
        :title="liveTitle"
      >
        {{ liveTitle }}
      </span>
      <el-text type="primary" size="small" style="flex-shrink: 0; margin-right: 12px;">
        (累计在线：{{ onlineNum }})
      </el-text>
      <el-button type="success" style="flex-shrink: 0;" @click="record()">
        录制
      </el-button>
    </div>
  </el-header>
  <div class="video-box">
    <video
      ref="nativeVideo"
      controls
      autoplay
      class="video-player"
      :poster="coverImage"
    />
    <div v-if="loading" class="loading-container">
      <el-icon color="#FFFFFF" class="is-loading" size="24px">
        <Loading />
      </el-icon>
      <span class="loading-text">正在加载直播...</span>
    </div>
  </div>
</template>

<style scoped>
.video-box {
  width: 100%;
  height: calc(100% - 60px);
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  position: relative;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: absolute;
  top: 0;
  left: 0;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 1;
}

.loading-text {
  color: #fff;
  font-size: 14px;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
