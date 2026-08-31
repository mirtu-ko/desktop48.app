<script setup lang="ts">
import type { TaskPayload } from '../assets/js/task-payload'
import { Refresh, RefreshLeft, RefreshRight, VideoCamera } from '@element-plus/icons-vue'
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
  /** 电台轮播图（liveType !== 1 时接口返回） */
  carousels?: {
    carousels: string[]
    carouselTime?: number | string
  }
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
  /** 迷你窗紧凑模式：隐藏次要信息，适配小尺寸画中画窗口 */
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'avatar', 'orientation'])

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
const boxDimensions = ref({ width: 0, height: 0 })
const coverImage = ref('')
const onlineNum = ref(0)
const powerSaveBlockerId = ref<number | null>(null)
const elapsedTime = ref(0)
/** 电台轮播图与切换间隔（毫秒） */
const carousels = ref<string[]>([])
const carouselTime = ref(5000)

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
let playerWatchStopHandle: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let livePlayer: ReturnType<typeof mpegts.createPlayer> | null = null

// 这一组方法只负责“直播详情”和界面状态同步，不直接处理播放器。
function applyLiveDetail(data: LiveDetail) {
  coverImage.value = Tools.sourceUrl(data.coverPath)
  // 电台轮播图：接口返回 carousels 时使用，否则回退封面图单张展示
  carousels.value = isRadio.value && data.carousels?.carousels?.length
    ? data.carousels.carousels.map(carousel => Tools.sourceUrl(carousel))
    : (data.coverPath ? [Tools.sourceUrl(data.coverPath)] : [])
  carouselTime.value = data.carousels?.carouselTime
    ? Number.parseInt(String(data.carousels.carouselTime))
    : 5000
  realName.value = data.user.userName
  // open 模式优先用传入的队伍 logo 作为顶部头像
  userAvatar.value = props.source === 'open' && props.avatarUrl
    ? props.avatarUrl
    : Tools.sourceUrl(data.user.userAvatar)
  // 头像上报给浮窗头部（fp-bar）展示
  emit('avatar', userAvatar.value)
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
    // 详情都取不到通常意味着直播已下架，广播通知列表页刷新
    EventBus.emit('live-unavailable', props.liveId)
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

// 旋转后画面横竖比例随之交换，重新上报给浮窗调整窗口比例
watch(rotationAngle, () => reportOrientation())

function updateVideoDimensions() {
  if (nativeVideo.value) {
    const nextVideoWidth = nativeVideo.value.videoWidth || 0
    const nextVideoHeight = nativeVideo.value.videoHeight || 0

    videoWidth.value = nextVideoWidth
    videoHeight.value = nextVideoHeight
  }
  reportOrientation()
}

// 计算旋转后画面实际呈现是否为横屏（90/270° 旋转会让源宽高交换），上报给浮窗决定窗口横竖比例
function reportOrientation() {
  if (isRadio.value)
    return
  const w = videoWidth.value
  const h = videoHeight.value
  if (!w || !h)
    return
  emit('orientation', isVerticalRotation.value ? h > w : w > h)
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
    // 重试耗尽视为直播结束，广播通知列表页刷新（流已不存在）
    EventBus.emit('live-unavailable', props.liveId)
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

async function resumeLive() {
  if (isManuallyUnmounted.value)
    return
  if (powerSaveBlockerId.value === null)
    powerSaveBlockerId.value = await window.mainAPI.preventSleep()
  startElapsedTimer()
  startOnlineNumTimer()
  // 播放器仍在则直接续播，否则按缓存地址重建或全量拉流
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
      if (isManuallyUnmounted.value)
        return
      setupPlayer(newPath)
    },
    { immediate: true },
  )

  // 迷你窗存在即启动播放会话
  resumeLive()
})

onUnmounted(() => {
  isManuallyUnmounted.value = true
  activeStreamRequestId++
  clearStreamRetryTimer()
  stopElapsedTimer()
  if (playerWatchStopHandle) {
    playerWatchStopHandle()
    playerWatchStopHandle = null
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
  <div class="live-player">
    <div ref="videoBoxRef" class="video-box" :class="{ 'vertical-rotation': !isRadio && isVerticalRotation, 'video-box-background': !isRadio }">
      <div v-if="isRadio" class="radio-box">
        <div class="radio-carousel">
          <el-carousel
            v-if="carousels.length > 0"
            :interval="carouselTime"
            indicator-position="none"
            arrow="never"
            height="100%"
          >
            <el-carousel-item v-for="carousel in carousels" :key="carousel">
              <img :src="carousel" class="radio-cover" alt="cover">
            </el-carousel-item>
          </el-carousel>
        </div>
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
      <div v-if="loading" class="loading-container" :class="{ 'loading-masked': isRadio }">
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
      <div class="live-status">
        <span class="live-dot" />
        <span class="live-label">LIVE</span>
        <span class="live-elapsed">{{ liveElapsedText }}</span>
        <span v-if="!compact && onlineNum > 0" class="live-online">在线 {{ onlineNum }}</span>
      </div>
      <div class="player-actions">
        <template v-if="liveType === 1">
          <el-button circle class="action-btn" title="向左旋转90°" @click="rotateLeft">
            <el-icon>
              <RefreshLeft />
            </el-icon>
          </el-button>
          <el-button circle class="action-btn" title="重置旋转" @click="resetRotation">
            <el-icon>
              <Refresh />
            </el-icon>
          </el-button>
          <el-button circle class="action-btn" title="向右旋转90°" @click="rotateRight">
            <el-icon>
              <RefreshRight />
            </el-icon>
          </el-button>
        </template>
        <el-button circle class="action-btn action-record" title="录制" @click="record()">
          <el-icon>
            <VideoCamera />
          </el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-player {
  width: 100%;
  height: 100%;
  display: flex;
}

.video-box {
  width: 100%;
  height: 100%;
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
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* 轮播铺满整个窗口 */
.radio-carousel {
  position: absolute;
  inset: 0;
  display: flex;
}

:deep(.el-carousel) {
  width: 100%;
  height: 100%;
}

:deep(.el-carousel__container) {
  height: 100%;
}

/* 电台封面铺满整个窗口：object-fit: cover 裁边填充 */
.radio-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 音频控件悬浮在封面底部居中 */
.audio-player {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  width: min(600px, 90%);
  z-index: 5;
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

/* 电台模式下封面轮播铺满窗口且较亮，加载时叠加深色蒙层保证动画可读 */
.loading-container.loading-masked {
  background: rgba(0, 0, 0, 0.55);
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
  border-top-color: var(--brand-primary);
  box-shadow: 0 0 18px rgba(108, 92, 231, 0.35);
  animation: spin 1.1s linear infinite;
}

.ring--inner {
  inset: 11px;
  border: 3px solid rgba(255, 255, 255, 0.12);
  border-bottom-color: var(--brand-primary-light);
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
  color: var(--brand-primary-light);
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

/* 直播模式下原生时间轴无意义（不可拖动），隐藏之，保留播放/音量/全屏等控件 */
.video-player::-webkit-media-controls-timeline {
  display: none !important;
}

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

.live-online {
  margin-left: 2px;
  font-size: 12px;
  opacity: 0.85;
}

/* 悬浮功能按钮：横排置于右上角（原标签位置），避开左下 LIVE 徽标与底部原生控件 */
.player-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  z-index: 30;
}

/* 统一按钮尺寸，覆盖 Element Plus 同级选择器引入的 margin-left */
.action-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  /* 覆盖 Element Plus 的 .el-button + .el-button { margin-left: 12px }（同级选择器且其样式表后加载） */
  margin-left: 0 !important;
  flex-shrink: 0;
  --el-button-bg-color: rgba(15, 17, 26, 0.55);
  --el-button-border-color: rgba(255, 255, 255, 0.16);
  --el-button-hover-bg-color: rgba(30, 33, 50, 0.8);
  --el-button-hover-border-color: rgba(255, 255, 255, 0.3);
  --el-button-text-color: #fff;
  --el-button-hover-text-color: #fff;
  backdrop-filter: blur(8px);
}

.action-record {
  --el-button-text-color: #ff8fa3;
  --el-button-hover-text-color: #ff5c7a;
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
