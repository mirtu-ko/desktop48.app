<script setup lang="ts">
import type { TaskPayload } from '../assets/js/task-payload'
import { Refresh, RefreshLeft, RefreshRight } from '@element-plus/icons-vue'
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
  /** 数据源：user=用户直播(getLiveOne)，open=开放公演(getOpenLiveOne) */
  source: { type: String, default: 'user' },
  /** open 模式下的顶部头像（队伍 logo，完整 URL） */
  avatarUrl: { type: String, default: '' },
  /** 当前 tab 是否为激活页，false 时后台暂停（停播放器/定时器、释放防休眠，保留本地流便于快速恢复） */
  active: { type: Boolean, default: true },
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
// 切走后台后保留本地流的时间上限（毫秒），超过则销毁，避免长期占用拉流资源
const BACKGROUND_STREAM_TTL = 60_000
const isManuallyUnmounted = ref(false)
const streamRestartToken = ref(0)
const isRecoveringStream = ref(false)
const rotationAngle = ref(0)
const videoWidth = ref(0)
const videoHeight = ref(0)
const boxDimensions = ref({ width: 0, height: 0 })
const coverImage = ref('')
const onlineNum = ref(0)
const powerSaveBlockerId = ref<number | null>(null)
const elapsedTime = ref(0)

const isRadio = computed(() => props.liveType !== 1)
const isVerticalRotation = computed(() => {
  const normalizedAngle = ((rotationAngle.value % 360) + 360) % 360
  return normalizedAngle === 90 || normalizedAngle === 270
})

// 旋转 90/270 度时，视频显示宽高会交换，这里单独计算一个缩放系数，
// 保证旋转后的画面仍然完整落在容器内。
function calculateRotationScale() {
  if (!isVerticalRotation.value)
    return 1

  const boxWidth = boxDimensions.value.width || videoBoxRef.value?.clientWidth || 0
  const boxHeight = boxDimensions.value.height || videoBoxRef.value?.clientHeight || 0
  const sourceWidth = videoWidth.value
  const sourceHeight = videoHeight.value

  if (boxWidth <= 0 || boxHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0)
    return 1

  const videoRatio = sourceWidth / sourceHeight
  const boxRatio = boxWidth / boxHeight
  let renderedWidth = 0
  let renderedHeight = 0

  if (videoRatio < boxRatio) {
    renderedHeight = boxHeight
    renderedWidth = renderedHeight * videoRatio
  }
  else {
    renderedWidth = boxWidth
    renderedHeight = renderedWidth / videoRatio
  }

  return Math.min(boxWidth / renderedHeight, boxHeight / renderedWidth)
}

const videoWrapperStyle = computed(() => {
  const angle = rotationAngle.value
  const scale = calculateRotationScale()

  return {
    transform: `rotate(${angle}deg) scale(${scale})`,
  }
})

const videoStyle = computed(() => {
  if (isVerticalRotation.value) {
    return {
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
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let backgroundDestroyTimer: ReturnType<typeof setTimeout> | null = null
let playerWatchStopHandle: (() => void) | null = null
let activeWatchStopHandle: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let livePlayer: ReturnType<typeof mpegts.createPlayer> | null = null

// 这一组方法只负责“直播详情”和界面状态同步，不直接处理播放器。
function applyLiveDetail(data: LiveDetail) {
  coverImage.value = Tools.sourceUrl(data.coverPath)
  realName.value = data.user.userName
  // open 模式优先用传入的队伍 logo 作为顶部头像
  userAvatar.value = props.source === 'open' && props.avatarUrl
    ? props.avatarUrl
    : Tools.sourceUrl(data.user.userAvatar)
  if (typeof data.onlineNum === 'number')
    onlineNum.value = data.onlineNum
}

async function fetchLiveDetail(): Promise<LiveDetail> {
  if (props.source === 'open') {
    // 开放公演：getOpenLiveOne 返回 playStreams 数组，选高清（streamType 2），
    // 没有用户信息，用标题兜底
    const data = await Apis.instance().openLive(props.liveId)
    const streams: Array<{ streamPath: string, streamType: number }> = data.playStreams || []
    const stream = streams.find(s => s.streamType === 2 && s.streamPath)
      || streams.find(s => s.streamPath)
    return {
      playStreamPath: stream?.streamPath || '',
      coverPath: data.coverPath || '',
      user: { userName: data.subTitle || data.title || '开放公演', userAvatar: '' },
      liveId: data.liveId,
    }
  }
  return await Apis.instance().live(props.liveId)
}

// 首次进入直播页时，先拿最新直播地址，再创建本地 HTTP-FLV 播放入口。
async function getOne() {
  loading.value = true
  retryCount.value = 0
  isRecoveringStream.value = false
  try {
    const data = await fetchLiveDetail()
    if (isManuallyUnmounted.value || !props.active)
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

// 直播已播时长：每秒刷新，基于开播时间戳（毫秒）累加。
function startElapsedTimer() {
  elapsedTimer = setInterval(() => {
    elapsedTime.value = Date.now() - props.startTime
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

const liveElapsedText = computed(() => {
  const totalSeconds = Math.max(0, Math.floor(elapsedTime.value / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
})

function updateOnlineNum() {
  // 开放公演接口没有在线人数字段，跳过轮询
  if (props.source === 'open') {
    return
  }
  Apis.instance().live(props.liveId).then((data) => {
    onlineNum.value = data.onlineNum
  }).catch((error: any) => {
    console.error(error)
  })
}

function rotateLeft() {
  rotationAngle.value = ((rotationAngle.value - 90) % 360 + 360) % 360
}

function rotateRight() {
  rotationAngle.value = (rotationAngle.value + 90) % 360
}

function resetRotation() {
  rotationAngle.value = 0
}

function updateVideoDimensions() {
  if (nativeVideo.value) {
    const nextVideoWidth = nativeVideo.value.videoWidth || 0
    const nextVideoHeight = nativeVideo.value.videoHeight || 0

    videoWidth.value = nextVideoWidth
    videoHeight.value = nextVideoHeight
  }
}

function handleNativeVideoResize() {
  updateVideoDimensions()
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

function pauseMediaElement() {
  const mediaElement = isRadio.value ? nativeAudio.value : nativeVideo.value
  if (!mediaElement)
    return
  mediaElement.pause()
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
  if (isManuallyUnmounted.value || !props.active || isRecoveringStream.value)
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
    // 重试耗尽视为直播结束，直接关闭当前 tab
    emit('close')
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

  fetchLiveDetail().then(async (detail) => {
    const date = Tools.dateFormat(Number.parseInt(String(props.startTime)), 'yyyyMMddhhmm')
    const filename = `${realName.value} ${date}.flv`
    const recordTask: TaskPayload = {
      url: detail.playStreamPath,
      filename,
      liveId: props.liveId,
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

// 基于本地 HTTP-FLV 地址创建并挂载 mpegts 播放器
function setupPlayer(path: string) {
  const mediaElement = isRadio.value ? nativeAudio.value : nativeVideo.value
  if (!mediaElement || !path)
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
    url: path,
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
      updateVideoDimensions()
    }
  }

  if (!isRadio.value)
    mediaElement.onloadedmetadata = () => updateVideoDimensions()

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
}

// 后台暂停：销毁播放器、停定时器、释放防休眠；但保留本地流进程与其地址，
// 恢复时可跳过重新拉源、直接重建播放器，实现秒切。
function pauseLive() {
  if (isManuallyUnmounted.value)
    return
  clearStreamRetryTimer()
  // 保留播放器与本地流，仅暂停底层媒体，切回时直接续播、不重建缓冲
  if (livePlayer)
    livePlayer.pause()
  pauseMediaElement()
  stopOnlineNumTimer()
  stopElapsedTimer()
  if (powerSaveBlockerId.value !== null) {
    window.mainAPI.allowSleep(powerSaveBlockerId.value)
    powerSaveBlockerId.value = null
  }
  // 后台停留超过阈值则销毁本地流，避免长期占用拉流资源
  startBackgroundDestroyTimer()
}

function clearBackgroundDestroyTimer() {
  if (backgroundDestroyTimer) {
    clearTimeout(backgroundDestroyTimer)
    backgroundDestroyTimer = null
  }
}

// 后台停留过久，销毁本地流并清空缓存地址；恢复时会走全量重新拉流。
// 若在定时器已触发、清理尚未完成时用户切回，则取消清理以保持流畅。
async function clearBackgroundStream() {
  clearBackgroundDestroyTimer()
  if (props.active || isManuallyUnmounted.value)
    return
  destroyLivePlayer()
  resetMediaElement()
  await stopCurrentLiveStream()
  playStreamPath.value = ''
  isRecoveringStream.value = false
}

function startBackgroundDestroyTimer() {
  clearBackgroundDestroyTimer()
  backgroundDestroyTimer = setTimeout(async () => {
    backgroundDestroyTimer = null
    await clearBackgroundStream()
  }, BACKGROUND_STREAM_TTL)
}

async function resumeLive() {
  if (isManuallyUnmounted.value)
    return
  clearBackgroundDestroyTimer()
  if (powerSaveBlockerId.value === null)
    powerSaveBlockerId.value = await window.mainAPI.preventSleep()
  startElapsedTimer()
  startOnlineNumTimer()
  // 播放器仍在则直接续播（期间未销毁本地流），否则按缓存地址重建或全量拉流
  if (livePlayer) {
    void Promise.resolve(livePlayer.play()).catch((error) => {
      console.error('[LivePlayer.vue] 恢复播放失败:', error)
    })
  }
  else if (playStreamPath.value) {
    setupPlayer(playStreamPath.value)
  }
  else {
    await getOne()
  }
}

onMounted(() => {
  console.log('[LivePlayer.vue] onMounted', props)

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

  if (nativeVideo.value)
    nativeVideo.value.addEventListener('resize', handleNativeVideoResize)

  playerWatchStopHandle = watch(
    () => playStreamPath.value,
    (newPath) => {
      // 暂停状态下不建播放器（resume 时会自行重建）
      if (isManuallyUnmounted.value || !props.active)
        return
      setupPlayer(newPath)
    },
    { immediate: true },
  )

  // 初始即激活则启动会话，否则保持后台暂停
  if (props.active)
    resumeLive()

  activeWatchStopHandle = watch(
    () => props.active,
    (active) => {
      if (isManuallyUnmounted.value)
        return
      if (active)
        resumeLive()
      else
        pauseLive()
    },
  )
})

onUnmounted(() => {
  isManuallyUnmounted.value = true
  activeStreamRequestId++
  clearStreamRetryTimer()
  stopElapsedTimer()
  clearBackgroundDestroyTimer()
  if (playerWatchStopHandle) {
    playerWatchStopHandle()
    playerWatchStopHandle = null
  }
  if (activeWatchStopHandle) {
    activeWatchStopHandle()
    activeWatchStopHandle = null
  }
  destroyLivePlayer()
  resetMediaElement()
  if (nativeVideo.value)
    nativeVideo.value.removeEventListener('resize', handleNativeVideoResize)
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
      <img v-if="userAvatar" :src="userAvatar" alt="Logo" style="width: 32px; height: 32px; margin-right: 12px; border-radius: 50%; object-fit: contain;">
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
          <el-icon>
            <RefreshLeft />
          </el-icon>
        </el-button>
        <el-button title="重置旋转" @click="resetRotation">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
        <el-button title="向右旋转90°" @click="rotateRight">
          <el-icon>
            <RefreshRight />
          </el-icon>
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
        :class="{ 'media-hidden': loading }"
      />
    </div>
    <div v-else class="video-wrapper" :style="videoWrapperStyle">
      <video
        ref="nativeVideo"
        controls
        autoplay
        class="video-player"
        :class="{ 'media-hidden': loading }"
        :style="videoStyle"
        :poster="coverImage"
      />
    </div>
    <div v-if="loading" class="loading-container">
      <div v-if="coverImage" class="loading-bg" :style="{ backgroundImage: `url(${coverImage})` }" />
      <div class="loading-spinner" aria-hidden="true">
        <div class="ring ring--outer" />
        <div class="ring ring--inner" />
      </div>
      <div class="loading-text">
        <span class="loading-text__label">正在加载直播</span>
        <span class="loading-text__dots"><span>.</span><span>.</span><span>.</span></span>
      </div>
      <div class="loading-hint">
        连接直播源中，请稍候
      </div>
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
    <div class="live-status">
      <span class="live-dot" />
      <span class="live-label">LIVE</span>
      <span class="live-elapsed">{{ liveElapsedText }}</span>
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

/* 加载期间隐藏媒体元素本体，避免浏览器原生 buffering 转圈与自定义 overlay 叠加 */
.video-box .media-hidden {
  opacity: 0;
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
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  z-index: 10;
  color: #fff;
  text-align: center;
  pointer-events: none;
  overflow: hidden;
}

/* 用封面图作加载背景，0.1 透明度淡显，不遮挡居中内容 */
.loading-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.1;
  z-index: 0;
}

.loading-spinner,
.loading-text,
.loading-hint {
  position: relative;
  z-index: 1;
}

.loading-spinner {
  position: relative;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner .ring {
  position: absolute;
  border-radius: 50%;
}

.ring--outer {
  inset: 0;
  border: 3px solid rgba(255, 255, 255, 0.14);
  border-top-color: #409eff;
  box-shadow: 0 0 18px rgba(64, 158, 255, 0.35);
  animation: spin 1.1s linear infinite;
}

.ring--inner {
  inset: 11px;
  border: 3px solid rgba(255, 255, 255, 0.12);
  border-bottom-color: #a0b8ff;
  animation: spin 0.8s linear infinite reverse;
}

.loading-text {
  display: flex;
  align-items: baseline;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
}

.loading-text__dots {
  display: inline-flex;
  margin-left: 2px;
  overflow: hidden;
}

.loading-text__dots span {
  animation: dot-bounce 1.2s ease-in-out infinite;
  color: #409eff;
  font-weight: 700;
}

.loading-text__dots span:nth-child(2) {
  animation-delay: 0.18s;
}

.loading-text__dots span:nth-child(3) {
  animation-delay: 0.36s;
}

.loading-hint {
  font-size: 12px;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.55);
}

.tag-container {
  position: absolute;
  top: 10px;
  right: 10px;
  transform: translate(0%, 0%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 10;
}

/* 直播模式下原生时间轴无意义（不可拖动），隐藏之，保留播放/音量/全屏等控件 */
.video-player::-webkit-media-controls-timeline {
  display: none !important;
}

/* 电台（音频）模式：直播无进度概念，隐藏进度条与时间文本，已播时长由 LIVE 徽标展示 */
/* .audio-player::-webkit-media-controls-timeline,
.audio-player::-webkit-media-controls-current-time-display,
.audio-player::-webkit-media-controls-time-remaining-display {
  display: none !important;
} */

.live-status {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1;
  z-index: 10;
  user-select: none;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  animation: live-pulse 1.2s ease-in-out infinite;
}

.live-label {
  font-weight: 600;
  letter-spacing: 0.5px;
}

.live-elapsed {
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.5);
  }
  50% {
    opacity: 0.6;
    box-shadow: 0 0 0 4px rgba(245, 108, 108, 0);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes dot-bounce {
  0%,
  100% {
    opacity: 0.2;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
</style>
