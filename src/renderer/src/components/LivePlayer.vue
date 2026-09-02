<script setup lang="ts">
import type { TaskPayload } from '../services/task-payload'
import { VideoCamera } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import mpegts from 'mpegts.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import useTasks from '../composables/use-tasks'

import { useVideoRotation } from '../composables/use-video-rotation'
import Apis from '../services/apis'
import EventBus from '../services/event-bus'
import Tools from '../utils/tools'

import MiniControls from './MiniControls.vue'
import RotationControls from './RotationControls.vue'

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
const coverImage = ref('')
const onlineNum = ref(0)
const powerSaveBlockerId = ref<number | null>(null)
const elapsedTime = ref(0)
/** 电台轮播图与切换间隔（毫秒） */
const carousels = ref<string[]>([])
const carouselTime = ref(5000)

const isRadio = computed(() => props.liveType !== 1)

// 旋转 / 容器全屏 / 迷你控制条状态：与 ReviewPlayer 共用同一套实现（useVideoRotation）
const {
  rotationAngle,
  isVerticalRotation,
  videoWrapperStyle,
  videoStyle,
  rotateHint,
  rotateLeft,
  rotateRight,
  resetRotation,
  onBoxDblClick,
  isFullscreen,
  toggleFullscreen,
  playing,
  muted,
  togglePlay,
  toggleMute,
  onVolumeChange,
  updateVideoDimensions,
} = useVideoRotation({
  videoBoxRef,
  getMedia: () => (isRadio.value ? nativeAudio.value : nativeVideo.value),
  getVideo: () => nativeVideo.value,
  isRadio,
  onOrientation: landscape => emit('orientation', landscape),
})

const router = useRouter()
const onlineNumTimer = ref<ReturnType<typeof setInterval> | null>(null)

let activeStreamRequestId = 0
let streamRetryTimer: ReturnType<typeof setTimeout> | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let playerWatchStopHandle: (() => void) | null = null
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

// 鼠标悬浮才响应快捷键：同屏可能有多个浮窗播放器，否则一次按键会把它们全部转一遍
const hovered = ref(false)

function onKeyDown(event: KeyboardEvent) {
  if (isRadio.value || !hovered.value || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]'))
    return
  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault()
    if (event.shiftKey)
      rotateLeft()
    else
      rotateRight()
    return
  }
  if (event.key === '0') {
    event.preventDefault()
    resetRotation()
  }
}

// 录制状态取共享任务 store：任务由谁发起、下载页是否挂载都不影响这里；
// 停止也走同一个任务对象，避免两处各持一份状态互相打架
const { handleTask, isTaskRunning, stopTask } = useTasks()
const recording = computed(() => isTaskRunning('record', props.liveId))

function onRecordClick() {
  if (!recording.value) {
    record()
    return
  }
  stopTask('record', props.liveId)
  ElMessage({ message: '已结束录制', type: 'info' })
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
    // 重试耗尽视为直播结束：广播通知列表页刷新（流已不存在），并直接关闭当前 tab
    EventBus.emit('live-unavailable', props.liveId)
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
    // 任务由 useTasks 这个模块级单例直接接住并启动，状态在按钮上就地可见，
    // 不再跳转下载页——完整播放器本身也是浮窗，跳走反而打断浏览
    await handleTask(recordTask, 'record')
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

  playerWatchStopHandle = watch(
    () => playStreamPath.value,
    (newPath) => {
      if (isManuallyUnmounted.value)
        return
      setupPlayer(newPath)
    },
    { immediate: true },
  )

  window.addEventListener('keydown', onKeyDown)

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
  if (streamId.value) {
    window.mainAPI.stopLiveStream(streamId.value).catch((err) => {
      console.error('停止直播流失败:', err)
    })
  }
  if (powerSaveBlockerId.value !== null)
    window.mainAPI.allowSleep(powerSaveBlockerId.value)
  stopOnlineNumTimer()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="live-player">
    <div
      ref="videoBoxRef"
      class="video-box"
      :class="{ 'vertical-rotation': !isRadio && isVerticalRotation, 'video-box-background': !isRadio }"
      @dblclick="onBoxDblClick"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
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
        <!-- 音频仅作媒体源，不渲染原生控件（播控走 MiniControls） -->
        <audio
          ref="nativeAudio"
          autoplay
          class="audio-player"
          @play="playing = true"
          @pause="playing = false"
          @volumechange="onVolumeChange"
        />
      </div>
      <div v-else class="video-wrapper" :style="videoWrapperStyle">
        <video
          ref="nativeVideo"
          autoplay
          class="video-player"
          :class="{ 'media-hidden': loading }"
          :style="videoStyle"
          :poster="coverImage"
          @play="playing = true"
          @pause="playing = false"
          @volumechange="onVolumeChange"
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
        <RotationControls
          v-if="liveType === 1"
          :angle="rotationAngle"
          @rotate-left="rotateLeft"
          @rotate-right="rotateRight"
          @reset="resetRotation"
        />
        <el-tooltip :content="recording ? '录制中，点击结束' : '录制'" placement="bottom" :show-after="400">
          <button
            class="action-btn action-record"
            :class="{ 'is-recording': recording }"
            :aria-label="recording ? '结束录制' : '录制'"
            @click="onRecordClick"
          >
            <el-icon :size="16">
              <VideoCamera />
            </el-icon>
          </button>
        </el-tooltip>
      </div>

      <!-- 全自绘控制条：直播无需进度条，电台/视频、旋转与否共用同一套交互 -->
      <MiniControls
        v-if="!loading"
        :playing="playing"
        :muted="muted"
        :is-fullscreen="isFullscreen"
        @toggle-play="togglePlay"
        @toggle-mute="toggleMute"
        @toggle-fullscreen="toggleFullscreen"
      />

      <div v-if="rotateHint" class="rotate-hint">
        {{ rotateHint }}
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

.video-box.vertical-rotation {
  overflow: hidden;
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

/* 音频仅作媒体源，不渲染原生控件（播控走 MiniControls） */
.audio-player {
  display: none;
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
  background: rgba(0, 0, 0, 0.9);
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
  box-shadow: 0 0 18px rgba(109, 90, 224, 0.35);
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
  gap: 8px;
  z-index: 30;
}

/* 悬浮操作按钮（录制 / 全屏）；旋转胶囊样式见 RotationControls.vue */
.action-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  font-size: 12px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  color: #fff;
  background: rgba(15, 17, 26, 0.55);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.1s ease;

  &:hover {
    background: rgba(30, 33, 50, 0.85);
  }

  &:active {
    transform: scale(0.92);
  }
}

.action-record {
  color: #ff8fa3;

  &:hover {
    color: #ff5c7a;
  }

  /* 录制中：常亮玫红底 + 呼吸光圈，切回播放器也能一眼看出在录 */
  &.is-recording {
    color: #fff;
    background: #ff5c7a;
    animation: record-pulse 1.4s ease-in-out infinite;
  }
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

@keyframes record-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 92, 122, 0.55);
  }
  50% {
    box-shadow: 0 0 0 7px rgba(255, 92, 122, 0);
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
