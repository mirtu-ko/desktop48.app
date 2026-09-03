<script setup lang="ts">
import type { TaskPayload } from '../services/task-payload'
import { ElMessage } from 'element-plus'
import mpegts from 'mpegts.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDownloadGuard } from '../composables/use-download-guard'
import { useSleepBlocker } from '../composables/use-sleep-blocker'
import useTasks from '../composables/use-tasks'

import { useVideoRotation } from '../composables/use-video-rotation'
import Apis from '../services/apis'
import EventBus from '../services/event-bus'
import { formatMediaTime } from '../utils/time-format'
import Tools from '../utils/tools'

import MediaIcon from './MediaIcon.vue'
import MiniControls from './MiniControls.vue'
import PlayerLoading from './PlayerLoading.vue'
import RadioStage from './RadioStage.vue'
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

const emit = defineEmits(['close', 'avatar', 'aspect'])

const realName = ref('')
const userAvatar = ref('')
const playStreamPath = ref('')
const nativeVideo = ref<HTMLVideoElement | null>(null)
// 电台模式的 audio 元素由 RadioStage 挂载/卸载时经 @audio 事件回传
const nativeAudio = ref<HTMLAudioElement | null>(null)
const streamId = ref('')
const videoBoxRef = ref<HTMLElement | null>(null)
const mediaLoading = ref(true)
const retryCount = ref(0)
const maxRetries = 3
const isManuallyUnmounted = ref(false)
const streamRestartToken = ref(0)
const isRecoveringStream = ref(false)
const coverImage = ref('')
const onlineNum = ref(0)
// 播放防休眠（use-sleep-blocker，与 ReviewPlayer 共用）
const { acquire: acquireSleepBlocker, release: releaseSleepBlocker } = useSleepBlocker()
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
  isPip,
  togglePip,
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
  onAspect: aspect => emit('aspect', aspect),
})

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
  mediaLoading.value = true
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
    mediaLoading.value = false
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
  return formatMediaTime(totalSeconds)
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

// 鼠标悬浮才响应快捷键：同屏可能有多个浮窗播放器，否则一次按键会把它们全部转一遍。
// 注：ReviewPlayer 走的是另一套「根节点焦点 keydown」策略，两边改动请互相参照。
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
    mediaLoading.value = true
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
        if (mediaLoading.value)
          isRecoveringStream.value = false
      }
    }, 2000)
  }
  else {
    mediaLoading.value = false
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
  mediaLoading.value = false
  scheduleStreamRetry()
}

// 录制走原始 RTMP 地址直存文件，和页面播放的 HTTP-FLV 链路保持解耦。
// 下载目录校验与 LivePlayer/ReviewPlayer 共用（use-download-guard）
const { checkDownloadDirectory } = useDownloadGuard()

async function record() {
  const valid = await checkDownloadDirectory()
  if (!valid)
    return

  fetchLiveDetail().then(async (detail) => {
    const filename = Tools.taskFilename(realName.value, Number.parseInt(String(props.startTime)), 'flv', ' ')
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
    mediaLoading.value = false
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
    mediaLoading.value = false
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
      mediaLoading.value = true
      scheduleStreamRetry()
      return
    }

    handleStreamError(`${errorType}:${errorDetail}`)
  })
}

async function resumeLive() {
  if (isManuallyUnmounted.value)
    return
  await acquireSleepBlocker()
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
  releaseSleepBlocker()
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
      <RadioStage
        v-if="isRadio"
        :carousels="carousels"
        :interval="carouselTime"
        autoplay
        @audio="nativeAudio = $event"
        @play="playing = true"
        @pause="playing = false"
        @volumechange="onVolumeChange"
      />
      <div v-else class="video-wrapper" :style="videoWrapperStyle">
        <video
          ref="nativeVideo"
          autoplay
          class="video-player"
          :class="{ 'media-hidden': mediaLoading }"
          :style="videoStyle"
          :poster="coverImage"
          @play="playing = true"
          @pause="playing = false"
          @volumechange="onVolumeChange"
        />
      </div>
      <PlayerLoading
        v-if="mediaLoading"
        :masked="isRadio"
        :background="coverImage"
        label="正在加载直播"
        hint="连接直播源中，请稍候"
      />
      <div class="player-actions">
        <RotationControls
          v-if="liveType === 1 && !mediaLoading"
          :angle="rotationAngle"
          @rotate-left="rotateLeft"
          @rotate-right="rotateRight"
          @reset="resetRotation"
        />
        <el-tooltip :content="recording ? '录制中，点击结束' : '录制'" placement="bottom" :show-after="400">
          <button
            class="action-btn action-btn--record"
            :class="{ 'is-active': recording }"
            :aria-label="recording ? '结束录制' : '录制'"
            @click="onRecordClick"
          >
            <MediaIcon name="videoCamera" :size="16" />
          </button>
        </el-tooltip>
      </div>

      <!-- 控制条：LIVE 状态段走 #leading 插槽；加载期间整条隐藏（连接中不显示 LIVE 状态） -->
      <MiniControls
        v-if="!mediaLoading"
        :playing="playing"
        :muted="muted"
        :is-fullscreen="isFullscreen"
        :show-pip="!isRadio"
        :is-pip="isPip"
        @toggle-play="togglePlay"
        @toggle-mute="toggleMute"
        @toggle-fullscreen="toggleFullscreen"
        @toggle-pip="togglePip"
      >
        <template #leading>
          <span class="live-status">
            <span class="live-dot" />
            <span class="live-label">LIVE</span>
            <span class="live-elapsed">{{ liveElapsedText }}</span>
            <span v-if="!compact && onlineNum > 0" class="live-online">在线 {{ onlineNum }}</span>
          </span>
        </template>
      </MiniControls>

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

/* LIVE 状态段：内嵌在 MiniControls 胶囊最左段的芯片（样式作用于插槽内容）。
   可收缩：空间不足时从右往左裁掉在线人数/时长尾巴，保住圆点与 LIVE 标识，
   绝不把右侧按钮挤出胶囊条 */
.live-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 1 auto;
  min-width: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
}

.live-online {
  margin-left: 1px;
  font-size: 11px;
  opacity: 0.85;
}

/* 悬浮按钮（录制）与右上角容器样式为全局 .player-actions / .action-btn，见 app.scss */

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
</style>
