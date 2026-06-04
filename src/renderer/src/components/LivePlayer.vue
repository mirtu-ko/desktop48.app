<script setup lang="ts">
import type { RecordTaskPayload } from '../assets/js/task-payload'
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import mpegts from 'mpegts.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'

import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import Tools from '../assets/js/tools'

interface LiveDetail {
  playStreamPath: string
  coverPath: string
  user: {
    userName: string
    userAvatar: string
  }
  onlineNum?: number
  liveId?: string
}

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
  startTime: { type: Number, required: true },
  liveType: { type: Number, required: true },
  liveMode: { type: Number, required: true },
})

const emit = defineEmits(['close'])

const realName = ref('')
const userAvatar = ref('')
const playStreamPath = ref('')
const nativeVideo = ref<HTMLVideoElement | null>(null)
const nativeAudio = ref<HTMLAudioElement | null>(null)
const streamId = ref('')
const videoBoxRef = ref<HTMLElement | null>(null)
const loading = ref(true)
const retryCount = ref(0)
const maxRetries = 3
const isManuallyUnmounted = ref(false)
const streamRestartToken = ref(0)
const isRecoveringStream = ref(false)
const rotationAngle = ref(0)
const videoWidth = ref(0)
const videoHeight = ref(0)
const videoWH = ref(0)
const boxDimensions = ref({ width: 0, height: 0 })
const coverImage = ref('')
const onlineNum = ref(0)
const powerSaveBlockerId = ref<number | null>(null)

const isRadio = computed(() => props.liveType !== 1)
const isVerticalRotation = computed(() => {
  const normalizedAngle = ((rotationAngle.value % 360) + 360) % 360
  return normalizedAngle === 90 || normalizedAngle === 270
})

const videoWrapperStyle = computed(() => {
  const angle = rotationAngle.value
  const vertical = isVerticalRotation.value
  const box = boxDimensions.value
  const boxWidth = box.width || videoBoxRef.value?.clientWidth || 0
  const boxHeight = box.height || videoBoxRef.value?.clientHeight || 0
  let scale = 1

  if (vertical && videoWidth.value > 0 && videoHeight.value > 0 && boxWidth > 0 && boxHeight > 0) {
    const boxWH = boxWidth / boxHeight
    let videoW = 1
    let videoH = 1
    if (videoWH.value < boxWH) {
      videoH = boxHeight
      videoW = boxHeight * videoWH.value
    }
    else {
      videoW = boxWidth
      videoH = videoW / videoWH.value
    }
    scale = Math.min(boxWidth / videoH, boxHeight / videoW)
  }

  return {
    transform: `rotate(${angle}deg) scale(${vertical ? scale : 1})`,
  }
})

const videoStyle = computed(() => {
  if (isVerticalRotation.value) {
    return {
      objectFit: 'contain' as const,
      maxWidth: '100%',
      maxHeight: '100%',
      width: 'auto',
      height: 'auto',
    }
  }

  return {}
})

const router = useRouter()
const onlineNumTimer = ref<ReturnType<typeof setInterval> | null>(null)

let activeStreamRequestId = 0
let streamRetryTimer: ReturnType<typeof setTimeout> | null = null
let playerWatchStopHandle: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let livePlayer: ReturnType<typeof mpegts.createPlayer> | null = null

// 这一组方法只负责“直播详情”和界面状态同步，不直接处理播放器。
function applyLiveDetail(data: LiveDetail) {
  coverImage.value = Tools.sourceUrl(data.coverPath)
  realName.value = data.user.userName
  userAvatar.value = Tools.sourceUrl(data.user.userAvatar)
  if (typeof data.onlineNum === 'number')
    onlineNum.value = data.onlineNum
}

async function fetchLiveDetail(): Promise<LiveDetail> {
  return await Apis.instance().live(props.liveId)
}

// 首次进入直播页时，先拿最新直播地址，再创建本地 HTTP-FLV 播放入口。
async function getOne() {
  loading.value = true
  retryCount.value = 0
  isRecoveringStream.value = false
  try {
    const data = await fetchLiveDetail()
    if (isManuallyUnmounted.value)
      return
    console.log('获取到的直播信息:', data)
    applyLiveDetail(data)
    await restartLiveStream(data.playStreamPath)
  }
  catch (error: any) {
    console.error('getOne()', error)
    ElMessage.error('获取直播信息失败')
    loading.value = false
    emit('close')
  }
}

function startOnlineNumTimer() {
  onlineNumTimer.value = setInterval(() => {
    updateOnlineNum()
  }, 30000)
}

function stopOnlineNumTimer() {
  if (onlineNumTimer.value) {
    clearInterval(onlineNumTimer.value)
    onlineNumTimer.value = null
  }
}

function updateOnlineNum() {
  Apis.instance().live(props.liveId).then((data) => {
    onlineNum.value = data.onlineNum
  }).catch((error: any) => {
    console.error(error)
  })
}

function rotateLeft() {
  rotationAngle.value = (rotationAngle.value - 90) % 360
}

function rotateRight() {
  rotationAngle.value = (rotationAngle.value + 90) % 360
}

function resetRotation() {
  rotationAngle.value = 0
}

function updateVideoDimensions() {
  if (nativeVideo.value) {
    videoWidth.value = nativeVideo.value.videoWidth || 0
    videoHeight.value = nativeVideo.value.videoHeight || 0
    videoWH.value = videoWidth.value / videoHeight.value
  }
}

// 这一组方法只处理“本地直播流会话”与播放器实例的清理，不涉及列表/录制逻辑。
function clearStreamRetryTimer() {
  if (streamRetryTimer) {
    clearTimeout(streamRetryTimer)
    streamRetryTimer = null
  }
}

function destroyLivePlayer() {
  if (livePlayer) {
    livePlayer.destroy()
    livePlayer = null
  }
}

function resetMediaElement() {
  const mediaElement = isRadio.value ? nativeAudio.value : nativeVideo.value
  if (!mediaElement)
    return

  mediaElement.pause()
  mediaElement.removeAttribute('src')
  mediaElement.load()
  mediaElement.onerror = null
  mediaElement.oncanplay = null
}

async function stopCurrentLiveStream() {
  const currentStreamId = streamId.value
  if (!currentStreamId)
    return

  streamId.value = ''
  try {
    await window.mainAPI.stopLiveStream(currentStreamId)
  }
  catch (err) {
    console.error('停止直播流失败:', err)
  }
}

async function startLiveStream(rtmpUrl: string, requestId: number) {
  const result = await window.mainAPI.createLiveStream(rtmpUrl, props.liveId)

  if (isManuallyUnmounted.value || requestId !== activeStreamRequestId) {
    try {
      await window.mainAPI.stopLiveStream(result.liveId || props.liveId)
    }
    catch (err) {
      console.error('关闭过期直播流失败:', err)
    }
    return false
  }

  streamId.value = result.liveId
  playStreamPath.value = `${result.url}?t=${Date.now()}&r=${streamRestartToken.value}`
  return true
}

async function restartLiveStream(rtmpUrl: string) {
  const requestId = ++activeStreamRequestId
  clearStreamRetryTimer()
  destroyLivePlayer()
  resetMediaElement()
  await stopCurrentLiveStream()
  if (isManuallyUnmounted.value || requestId !== activeStreamRequestId)
    return false
  streamRestartToken.value++
  return await startLiveStream(rtmpUrl, requestId)
}

// 网络抖动、链接过期等都走这里的统一重试节奏，避免并发重连。
function scheduleStreamRetry() {
  if (isManuallyUnmounted.value || isRecoveringStream.value)
    return

  if (retryCount.value < maxRetries) {
    retryCount.value++
    isRecoveringStream.value = true
    loading.value = true
    clearStreamRetryTimer()
    streamRetryTimer = setTimeout(async () => {
      try {
        const data = await fetchLiveDetail()
        if (isManuallyUnmounted.value)
          return
        applyLiveDetail(data)
        await restartLiveStream(data.playStreamPath)
      }
      catch (error) {
        console.error('[LivePlayer.vue] 重试恢复直播流失败:', error)
        isRecoveringStream.value = false
        scheduleStreamRetry()
        return
      }
      finally {
        if (loading.value)
          isRecoveringStream.value = false
      }
    }, 2000)
  }
  else {
    loading.value = false
    isRecoveringStream.value = false
    ElMessage.warning('直播已结束')
    if (streamId.value) {
      window.mainAPI.stopLiveStream(streamId.value).catch((err) => {
        console.error('停止直播流失败:', err)
      })
    }
  }
}

function handleStreamError(reason: string) {
  console.error('[LivePlayer.vue] 直播播放异常:', reason)
  destroyLivePlayer()
  loading.value = false
  scheduleStreamRetry()
}

// 录制走原始 RTMP 地址直存文件，和页面播放的 HTTP-FLV 链路保持解耦。
async function checkDownloadDirectory(): Promise<boolean> {
  try {
    const result = await window.mainAPI.getConfig('downloadDirectory')
    if (!result) {
      ElMessage({
        message: '下载目录不存在，请先配置下载目录',
        type: 'warning',
      })
      router.push('/setting')
      return false
    }
    return true
  }
  catch (error: any) {
    console.error(error)
    ElMessage({ message: '检查下载目录失败', type: 'error' })
    return false
  }
}

async function record() {
  const valid = await checkDownloadDirectory()
  if (!valid)
    return

  Apis.instance().live(props.liveId).then(async (content) => {
    const date = Tools.dateFormat(Number.parseInt(String(props.startTime)), 'yyyyMMddhhmm')
    const filename = `${realName.value} ${date}.flv`
    const recordTask: RecordTaskPayload = {
      url: content.playStreamPath,
      filename,
      liveId: content.liveId,
    }
    EventBus.emit('change-selected-menu', Constants.Menu.DOWNLOADS)
    router.push('/downloads')
    setTimeout(() => {
      EventBus.emit('record-task', recordTask)
    })
  }).catch((error) => {
    console.error(error)
  })
}

startOnlineNumTimer()

onMounted(async () => {
  powerSaveBlockerId.value = await window.mainAPI.preventSleep()

  if (!isRadio.value && videoBoxRef.value) {
    boxDimensions.value = {
      width: videoBoxRef.value.clientWidth,
      height: videoBoxRef.value.clientHeight,
    }

    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        boxDimensions.value = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        }
      }
    })

    resizeObserver.observe(videoBoxRef.value)
  }
})

onMounted(() => {
  console.log('[LivePlayer.vue] onMounted', props)
  getOne()
  playerWatchStopHandle = watch(
    () => playStreamPath.value,
    (newPath) => {
      const mediaElement = isRadio.value ? nativeAudio.value : nativeVideo.value
      if (!mediaElement || !newPath)
        return

      // 播放地址变化时，销毁旧实例并按最新本地 FLV 地址重新挂载。
      destroyLivePlayer()

      if (!mpegts.isSupported() || !mpegts.getFeatureList().mseLivePlayback) {
        loading.value = false
        ElMessage.error('当前环境不支持 HTTP-FLV 直播播放')
        return
      }

      const player = mpegts.createPlayer({
        type: 'flv',
        isLive: true,
        cors: true,
        withCredentials: false,
        url: newPath,
      }, {
        enableWorker: true,
        enableStashBuffer: false,
        isLive: true,
        lazyLoad: false,
        liveBufferLatencyChasing: true,
        liveBufferLatencyMaxLatency: 1.5,
        liveBufferLatencyMinRemain: 0.3,
        liveSync: true,
        liveSyncMaxLatency: 1.2,
        liveSyncTargetLatency: 0.6,
        liveSyncPlaybackRate: 1.2,
      })

      livePlayer = player
      player.attachMediaElement(mediaElement)
      player.load()
      void Promise.resolve(player.play()).catch((error) => {
        console.error('[LivePlayer.vue] 自动播放失败:', error)
      })

      mediaElement.oncanplay = () => {
        loading.value = false
        isRecoveringStream.value = false
        if (!isRadio.value) {
          setTimeout(() => {
            updateVideoDimensions()
          }, 100)
        }
      }

      mediaElement.onerror = () => {
        handleStreamError('native media error')
      }

      player.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
        if (isManuallyUnmounted.value) {
          player.destroy()
          if (livePlayer === player)
            livePlayer = null
          return
        }

        console.error('[LivePlayer.vue] HTTP-FLV 错误:', errorType, errorDetail, errorInfo)
        if (errorType === mpegts.ErrorTypes.NETWORK_ERROR) {
          loading.value = true
          scheduleStreamRetry()
          return
        }

        handleStreamError(`${errorType}:${errorDetail}`)
      })
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  isManuallyUnmounted.value = true
  activeStreamRequestId++
  clearStreamRetryTimer()
  if (playerWatchStopHandle) {
    playerWatchStopHandle()
    playerWatchStopHandle = null
  }
  destroyLivePlayer()
  resetMediaElement()
  if (streamId.value) {
    window.mainAPI.stopLiveStream(streamId.value).catch((err) => {
      console.error('停止直播流失败:', err)
    })
  }
  if (powerSaveBlockerId.value !== null)
    window.mainAPI.allowSleep(powerSaveBlockerId.value)
  stopOnlineNumTimer()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
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
      <el-text v-if="onlineNum > 0" type="primary" size="small" style="flex-shrink: 0; margin-right: 12px;">
        (累计在线：{{ onlineNum }})
      </el-text>
      <el-button type="success" style="flex-shrink: 0; margin-right: 8px;" @click="record()">
        录制
      </el-button>
      <el-button-group v-if="liveType === 1" style="flex-shrink: 0;">
        <el-button title="向左旋转90°" @click="rotateLeft">
          ↺
        </el-button>
        <el-button title="重置旋转" @click="resetRotation">
          <svg t="1770917205717" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2776" width="12" height="12"><path d="M0 0.004h1023.996V1024H0z" fill-opacity="0" p-id="2777" /><path d="M502.698 58.304l-126.5-54.7c-26.5-10.3-56.3 2.2-67.6 28.3s0.1 56.4 25.7 68.6C157.3 174.403 46.9 352.901 60 544.301S206.6 897.6 391.999 946.7c4.5 1.1 9.2 1.7 13.8 1.8 26.5 0 48.8-19.7 52.3-45.9s-13.1-51-38.6-57.9c-144-38.3-246.7-165.399-254-314.298s82.7-285.3 222.3-337.399l-8.4 19.5c-5.5 12.9-5.7 27.4-0.4 40.4 5.2 13 15.4 23.3 28.3 28.8 6.5 2.9 13.5 4.3 20.6 4.4 20.9 0.2 40-12 48.6-31.1l53.699-127.4c11.3-26.9-0.9-57.7-27.5-69.3z m460.298 451.498c5.4-202.3-125.2-383.199-318.998-441.698-18.3-6.3-38.6-2-52.8 11s-20.2 32.9-15.6 51.7 19.2 33.5 38 38.3c133.6 39.899 229.799 156.699 243.199 295.498s-58.6 271.8-182.2 336.499c14-25.5 4.6-57.5-20.8-71.5-25.5-14-57.5-4.6-71.5 20.8l-71.899 117.2c-7.5 11.9-9.9 26.3-6.6 40 3.3 13.7 11.9 25.5 23.9 32.8l117.1 72.799c16.1 12.1 37.6 14.1 55.6 5s29.2-27.6 29-47.7c-0.2-20.1-11.8-38.4-30-47.1l-16-10c165.099-66.9 274.898-225.399 279.598-403.598z" fill="#4C4C4C" p-id="2778" /></svg>
        </el-button>
        <el-button title="向右旋转90°" @click="rotateRight">
          ↻
        </el-button>
      </el-button-group>
    </div>
  </el-header>
  <div ref="videoBoxRef" class="video-box" :class="{ 'vertical-rotation': !isRadio && isVerticalRotation, 'video-box-background': !isRadio }">
    <div v-if="isRadio" class="radio-box">
      <img :src="coverImage" class="radio-cover" alt="cover">
      <audio
        ref="nativeAudio"
        controls
        autoplay
        class="audio-player"
      />
    </div>
    <div v-else class="video-wrapper" :style="videoWrapperStyle">
      <video
        ref="nativeVideo"
        controls
        autoplay
        class="video-player"
        :style="videoStyle"
        :poster="coverImage"
      />
    </div>
    <div v-if="loading" class="loading-container">
      <el-icon color="#FFFFFF" class="is-loading" size="24px">
        <Loading />
      </el-icon>
      <span class="loading-text">正在加载直播...</span>
    </div>
    <div class="tag-container">
      <el-tag v-if="liveType === 1 && liveMode === 0">
        直播
      </el-tag>
      <el-tag v-else-if="liveType === 1 && liveMode === 1" type="success">
        录屏
      </el-tag>
      <el-tag v-else type="warning">
        电台
      </el-tag>
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
  position: relative;
  overflow: hidden;
  min-height: 200px;
}

.video-box-background {
  background: #0c0c0c;
}

.video-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.3s ease;
  transform-origin: center center;
  width: 100%;
  height: 100%;
}

.video-box.vertical-rotation {
  overflow: hidden;
}

.video-box.vertical-rotation .video-wrapper {
  width: 100%;
  height: 100%;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.radio-box {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  gap: 16px;
}

.radio-cover {
  max-width: 60%;
  max-height: 80%;
  object-fit: contain;
}

.audio-player {
  width: min(600px, 90%);
}

.loading-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.tag-container {
  position: absolute;
  top: 10px;
  left: 10px;
  transform: translate(0%, 0%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 10;
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
