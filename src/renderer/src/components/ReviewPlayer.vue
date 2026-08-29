<script setup lang="ts">
import type { TaskPayload } from '../assets/js/task-payload'
import type { BarrageListItem } from './Barrage.vue'
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import EventBus from '../assets/js/event-bus'
import Tools from '../assets/js/tools'

import BarrageBox from '../components/BarrageBox.vue'

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
  startTime: { type: Number, required: true },
  // 是否处于前台标签页。标签页切走后 DOM 仍然存在，需要靠这个标记暂停播放
  active: { type: Boolean, default: true },
})

const playStreamPath = ref('')
const isRadio = ref(false)
const number = ref(0)
const nativeVideo = ref<HTMLVideoElement | null>(null)
const nativeAudio = ref<HTMLAudioElement | null>(null)
const currentTime = ref(0)
const carousels = ref<string[]>([])
const carouselTime = ref(5000)
const barrageUrl = ref('')
const barrageLoaded = ref(false)
const loadedBarrageUrl = ref('')
const realName = ref('')
const userAvatar = ref('')
const powerSaveBlockerId = ref<number | null>(null)
const lastPlaybackError = ref('')
const mediaLoading = ref(true)
const mediaBuffering = ref(false)
const sidebarVisible = ref(true)
// 仅记录“被切到后台而暂停”的情形，用户自己按下的暂停不该在切回时被强行播放
let pausedByInactive = false

// 弹幕唯一数据源：解析时就把 [hh:mm:ss] 转成秒并排序，
// 之后所有消费方（右侧列表 / 视频叠加层）都只持有指向它的游标，不再复制数组。
interface BarrageEntry extends BarrageListItem {}
const barrageEntries = shallowRef<BarrageEntry[]>([])
// 右侧列表与叠加层的进度基准不同（列表滞后 1s），因此各自维护一个游标
let listCursor = 0
let overlayCursor = 0
// 右侧列表当前展示的弹幕：从头累积到当前进度，超出上限时丢弃最早的
const barrageListItems = shallowRef<BarrageListItem[]>([])
const MAX_LIST_ITEMS = 500
const LIST_DELAY_SECONDS = 1

// 视频弹幕叠加层状态
interface DanmakuOverlayItem {
  id: number
  content: string
  track: number
  // 该弹幕左边缘与容器右边缘重合的播放时刻，位置由 currentTime 反推
  bornAt: number
  width: number
  // 本条弹幕完全离开屏幕的播放时刻，用于回收与轨道复用判定
  leaveAt: number
  // 出生时的容器宽度，即左边缘起点
  startX: number
  // 逐条记录速度，改设置时已在飞的弹幕仍按原速走完，不会突然错位
  speed: number
  trackHeight: number
}
const danmakuOverlayItems = shallowRef<DanmakuOverlayItem[]>([])
let nextDanmakuId = 0
let danmakuAnimFrameId: number | null = null
// id -> DOM 节点，渲染循环直接改 transform，绕过响应式
const danmakuNodes = new Map<number, HTMLElement>()
// 每条轨道上最后一条弹幕，用于追尾判定
const trackTails: (DanmakuOverlayItem | null)[] = []
const DANMAKU_FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif'
// 原生 controls 高度，轨道区域需要避开，否则底部弹幕会被控件遮挡
const CONTROLS_RESERVED_HEIGHT = 60
let textMeasureCtx: CanvasRenderingContext2D | null = null

// 弹幕显示设置，持久化在 localStorage（主进程 config 只接受固定几个 key）
const DANMAKU_SETTINGS_KEY = 'review-danmaku-settings'
interface DanmakuSettings {
  enabled: boolean
  opacity: number
  fontSize: number
  speed: number
  // 弹幕可占用的高度比例，1 表示铺满
  area: number
}
const settings = reactive<DanmakuSettings>({
  enabled: true,
  opacity: 1,
  fontSize: 24,
  speed: 200,
  area: 1,
})

function loadDanmakuSettings() {
  try {
    const raw = localStorage.getItem(DANMAKU_SETTINGS_KEY)
    if (!raw)
      return
    Object.assign(settings, JSON.parse(raw) as Partial<DanmakuSettings>)
  }
  catch (error) {
    console.error('[ReviewPlayer.vue] 弹幕设置读取失败:', error)
  }
}

function saveDanmakuSettings() {
  localStorage.setItem(DANMAKU_SETTINGS_KEY, JSON.stringify({ ...settings }))
}

const router = useRouter()

let hlsInstance: Hls | null = null

const trackHeight = computed(() => Math.round(settings.fontSize * 1.6))

// 录播页只做两类事情：
// 1. 按播放地址选择 HLS 或原生 MP4 播放
// 2. 按录播资源加载弹幕，并在回退/重播时重置弹幕状态
function getActiveMediaElement() {
  return isRadio.value ? nativeAudio.value : nativeVideo.value
}

function resetMediaElement(mediaElement: HTMLMediaElement | null) {
  if (!mediaElement)
    return

  mediaElement.pause()
  mediaElement.removeAttribute('src')
  mediaElement.load()
  mediaElement.ontimeupdate = null
  mediaElement.onseeking = null
  mediaElement.onloadedmetadata = null
  mediaElement.onerror = null
  mediaElement.onwaiting = null
  mediaElement.onplaying = null
  mediaElement.onpause = null
  mediaElement.onended = null
}

function destroyPlayer() {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }

  resetMediaElement(nativeVideo.value)
  resetMediaElement(nativeAudio.value)
}

const videoBoxRef = ref<HTMLElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)

// =========== 视频弹幕叠加层 ===========
// 位置不再逐帧累加，而是由播放进度反推：x = 容器宽度 - (currentTime - bornAt) * speed。
// 这样暂停、缓冲、倍速、seek 都会自动同步，无需额外处理。
function measureTextWidth(text: string): number {
  if (!textMeasureCtx) {
    const canvas = document.createElement('canvas')
    textMeasureCtx = canvas.getContext('2d')
  }
  if (!textMeasureCtx)
    return text.length * settings.fontSize

  // 每次测量都同步字体，字号设置变化后宽度才准
  textMeasureCtx.font = `${settings.fontSize}px ${DANMAKU_FONT_FAMILY}`
  return textMeasureCtx.measureText(text).width
}

function getMaxTracks(): number {
  const height = (videoBoxRef.value?.clientHeight || 0) - CONTROLS_RESERVED_HEIGHT
  if (height <= 0)
    return 0
  return Math.max(0, Math.floor((height * settings.area - 10) / trackHeight.value))
}

// 给定播放时刻下弹幕左边缘的坐标
function danmakuLeft(item: DanmakuOverlayItem, time: number): number {
  return item.startX - (time - item.bornAt) * item.speed
}

// 轨道可复用的条件：尾部弹幕的右边缘已经越过新弹幕的左边缘，否则两者会重叠
function findAvailableTrack(now: number, newLeft: number): number {
  const maxTracks = getMaxTracks()
  for (let i = 0; i < maxTracks; i++) {
    const tail = trackTails[i]
    if (!tail || tail.leaveAt <= now)
      return i

    if (danmakuLeft(tail, now) + tail.width <= newLeft)
      return i
  }
  return -1
}

function addDanmakuToOverlay(entry: BarrageEntry, now: number) {
  const containerWidth = videoBoxRef.value?.clientWidth || 0
  if (containerWidth <= 0)
    return

  const text = entry.content || ''
  if (!text)
    return

  const textWidth = measureTextWidth(text) + 20
  const speed = settings.speed
  // 以弹幕自身时间戳为起点，而非 timeupdate 的回调时刻，
  // 这样同一个 250ms 回调窗口内的弹幕会按真实时间自然错开而不是挤在一起。
  const bornAt = entry.seconds
  const newLeft = containerWidth - (now - bornAt) * speed
  const track = findAvailableTrack(now, newLeft)
  if (track < 0)
    return

  const item: DanmakuOverlayItem = {
    id: nextDanmakuId++,
    content: text,
    track,
    bornAt,
    width: textWidth,
    leaveAt: bornAt + (containerWidth + textWidth) / speed,
    startX: containerWidth,
    speed,
    trackHeight: trackHeight.value,
  }
  trackTails[track] = item
  danmakuOverlayItems.value = [...danmakuOverlayItems.value, item]
}

// 二分查找第一条时间 >= target 的弹幕下标，seek 时用它重置游标
function findFirstIndexAtOrAfter(target: number): number {
  const list = barrageEntries.value
  let low = 0
  let high = list.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (list[mid].seconds < target) {
      low = mid + 1
    }
    else {
      high = mid
    }
  }
  return low
}

function clearOverlay() {
  danmakuOverlayItems.value = []
  trackTails.length = 0
  danmakuNodes.clear()
}

function setDanmakuNode(item: DanmakuOverlayItem, el: HTMLElement | null) {
  if (!el) {
    danmakuNodes.delete(item.id)
    return
  }
  danmakuNodes.set(item.id, el)
  // 挂载当帧先摆到正确位置，避免在左上角闪一下
  el.style.transform = `translate(${danmakuLeft(item, currentTime.value)}px, ${item.track * item.trackHeight + 4}px)`
}

// seek / 重播统一入口：叠加层游标二分定位，列表按“从头到当前”重建
function seekBarragesTo(time: number) {
  clearOverlay()
  overlayCursor = findFirstIndexAtOrAfter(time)
  listCursor = findFirstIndexAtOrAfter(time - LIST_DELAY_SECONDS)
  // 保持原有体验：拖动进度后列表展示视频开始到当前时刻的全部弹幕
  barrageListItems.value = listCursor > MAX_LIST_ITEMS
    ? barrageEntries.value.slice(listCursor - MAX_LIST_ITEMS, listCursor)
    : barrageEntries.value.slice(0, listCursor)
  currentTime.value = time
}

function processOverlayDanmaku(time: number) {
  const list = barrageEntries.value
  if (!settings.enabled) {
    // 关闭期间只推进游标，重新打开时不会一次性倒灌历史弹幕
    overlayCursor = findFirstIndexAtOrAfter(time)
    return
  }
  while (overlayCursor < list.length && list[overlayCursor].seconds <= time) {
    addDanmakuToOverlay(list[overlayCursor], time)
    overlayCursor++
  }
}

function processListDanmaku(time: number) {
  const list = barrageEntries.value
  const threshold = time - LIST_DELAY_SECONDS
  const start = listCursor
  while (listCursor < list.length && list[listCursor].seconds <= threshold)
    listCursor++

  if (listCursor === start)
    return

  const merged = barrageListItems.value.concat(list.slice(start, listCursor))
  barrageListItems.value = merged.length > MAX_LIST_ITEMS
    ? merged.slice(merged.length - MAX_LIST_ITEMS)
    : merged
}

// 渲染循环只做两件事：按播放进度回收离屏弹幕、把位置写进 DOM。
// 直接写 style 避免每帧触发全量响应式 patch。
function startDanmakuAnimation() {
  const loop = () => {
    const media = getActiveMediaElement()
    const now = media ? media.currentTime : currentTime.value
    const items = danmakuOverlayItems.value

    if (items.length > 0) {
      const remaining: DanmakuOverlayItem[] = []
      for (const item of items) {
        if (item.leaveAt <= now) {
          if (trackTails[item.track] === item)
            trackTails[item.track] = null
          danmakuNodes.delete(item.id)
          continue
        }
        remaining.push(item)
        const node = danmakuNodes.get(item.id)
        if (node)
          node.style.transform = `translate(${danmakuLeft(item, now)}px, ${item.track * item.trackHeight + 4}px)`
      }
      if (remaining.length !== items.length)
        danmakuOverlayItems.value = remaining
    }

    danmakuAnimFrameId = requestAnimationFrame(loop)
  }
  danmakuAnimFrameId = requestAnimationFrame(loop)
}

function stopDanmakuAnimation() {
  if (danmakuAnimFrameId !== null) {
    cancelAnimationFrame(danmakuAnimFrameId)
    danmakuAnimFrameId = null
  }
}
// =========== 视频弹幕叠加层结束 ===========

function attemptAutoplay(mediaElement: HTMLMediaElement) {
  // 后台标签页不自动播放，标记成“因切走而暂停”，切回前台时再补播
  if (!props.active) {
    pausedByInactive = true
    return
  }
  void Promise.resolve(mediaElement.play()).catch((error) => {
    console.error('[ReviewPlayer.vue] 自动播放失败:', error)
  })
}

function notifyPlaybackError(message: string) {
  if (lastPlaybackError.value === message)
    return

  lastPlaybackError.value = message
  mediaLoading.value = false
  mediaBuffering.value = false
}

async function acquireSleepBlocker() {
  if (powerSaveBlockerId.value !== null)
    return
  powerSaveBlockerId.value = await window.mainAPI.preventSleep()
}

function releaseSleepBlocker() {
  if (powerSaveBlockerId.value === null)
    return
  window.mainAPI.allowSleep(powerSaveBlockerId.value)
  powerSaveBlockerId.value = null
}

async function ensureBarragesLoaded() {
  if (!barrageUrl.value || loadedBarrageUrl.value === barrageUrl.value)
    return

  try {
    const response = await Apis.instance().barrage(barrageUrl.value)
    loadedBarrageUrl.value = barrageUrl.value
    // 预计算秒数并排序，之后游标推进与二分查找都不必再解析时间字符串
    barrageEntries.value = Tools.lyricsParse(response)
      .map((item: any, index: number) => ({
        id: index,
        seconds: Tools.timeToSecond(item.time),
        time: item.time,
        username: item.username,
        content: item.content,
      }))
      .sort((a, b) => a.seconds - b.seconds)
    barrageLoaded.value = true
    // 弹幕晚于播放到达时，按当前进度补齐列表与叠加层
    seekBarragesTo(getActiveMediaElement()?.currentTime ?? 0)
  }
  catch (error: any) {
    console.error(error)
    ElMessage({ message: '弹幕加载失败', type: 'error' })
  }
}

function bindMediaEvents(mediaElement: HTMLMediaElement) {
  mediaElement.ontimeupdate = () => {
    onTimeUpdate(mediaElement.currentTime)
  }

  // 用原生 seeking 事件替代靠 currentTime 跳变幅度的猜测，小幅拖动也能识别
  mediaElement.onseeking = () => {
    seekBarragesTo(mediaElement.currentTime)
  }

  mediaElement.onloadedmetadata = async () => {
    lastPlaybackError.value = ''
    mediaLoading.value = false
    await ensureBarragesLoaded()
    attemptAutoplay(mediaElement)
  }

  mediaElement.onwaiting = () => {
    mediaBuffering.value = true
  }

  mediaElement.onplaying = () => {
    mediaBuffering.value = false
    mediaLoading.value = false
    void acquireSleepBlocker()
  }

  mediaElement.onpause = releaseSleepBlocker
  mediaElement.onended = releaseSleepBlocker

  mediaElement.onerror = () => {
    console.error('[ReviewPlayer.vue] 录播播放失败:', playStreamPath.value)
    notifyPlaybackError('录播播放失败，请稍后重试或检查播放地址是否有效')
  }
}

// 录播是 VOD 场景，保留 HLS 最合适；如果是 MP4 则直接交给原生 video。
function attachPlaybackSource(newPath: string) {
  const mediaElement = getActiveMediaElement()
  if (!mediaElement)
    return

  destroyPlayer()
  lastPlaybackError.value = ''
  mediaLoading.value = true

  if (newPath.endsWith('.m3u8')) {
    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsInstance = hls
      hls.loadSource(newPath)
      hls.attachMedia(mediaElement)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('[ReviewPlayer.vue] HLS 录播播放失败:', data)

        if (!data.fatal)
          return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          notifyPlaybackError('录播加载失败，播放地址可能已失效或网络不可用')
        }
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          notifyPlaybackError('录播播放失败，媒体内容可能已损坏或编码不受支持')
        }
        else {
          notifyPlaybackError('录播播放失败，请稍后重试')
        }
      })
    }
    else if (mediaElement.canPlayType('application/vnd.apple.mpegurl')) {
      mediaElement.src = newPath
    }
    else {
      notifyPlaybackError('当前环境不支持录播 HLS 播放')
      return
    }
  }
  else {
    mediaElement.src = newPath
    mediaElement.load()
  }

  bindMediaEvents(mediaElement)
  attemptAutoplay(mediaElement)
}

function retryPlayback() {
  if (!playStreamPath.value)
    return
  attachPlaybackSource(playStreamPath.value)
}

async function getOne() {
  try {
    const data = await Apis.instance().live(props.liveId)

    const nextPlayStreamPath = Tools.streamPathHandle(data.playStreamPath, props.startTime)
    const nextBarrageUrl = data.msgFilePath || ''

    if (!data.review) {
      ElMessage({
        message: '该视频不是录播',
        type: 'warning',
      })
      router.push('/live')
      return
    }

    isRadio.value = data.liveType === 2
    number.value = data.onlineNum
    realName.value = data.user.userName
    userAvatar.value = Tools.sourceUrl(data.user.userAvatar)
    carousels.value = isRadio.value && data.carousels?.carousels?.length
      ? data.carousels.carousels.map((carousel: string) => Tools.sourceUrl(carousel))
      : []
    carouselTime.value = isRadio.value && data.carousels?.carouselTime
      ? Number.parseInt(data.carousels.carouselTime)
      : 5000

    const barrageSourceChanged = barrageUrl.value !== nextBarrageUrl
    barrageUrl.value = nextBarrageUrl
    playStreamPath.value = nextPlayStreamPath

    if (barrageSourceChanged) {
      barrageLoaded.value = false
      loadedBarrageUrl.value = ''
      barrageEntries.value = []
      seekBarragesTo(0)
    }
  }
  catch (error: any) {
    console.error(error)
    ElMessage({ message: '获取录播信息失败', type: 'error' })
  }
}

function play() {
  const mediaElement = getActiveMediaElement()
  if (mediaElement) {
    void mediaElement.play()
  }
  else {
    console.warn('active media element is null')
  }
}

defineExpose({ play, download })

// seek 由 onseeking 处理，这里只负责按进度投放弹幕
function onTimeUpdate(newTime: number) {
  currentTime.value = newTime
  processListDanmaku(newTime)
  processOverlayDanmaku(newTime)
}

// 点击右侧弹幕即跳转到对应时间点
function seekTo(seconds: number) {
  const mediaElement = getActiveMediaElement()
  if (!mediaElement)
    return
  mediaElement.currentTime = Math.max(0, seconds)
  void mediaElement.play()
}

async function copyStreamPath() {
  if (!playStreamPath.value) {
    ElMessage({ message: '播放地址还未就绪', type: 'warning' })
    return
  }
  try {
    await navigator.clipboard.writeText(playStreamPath.value)
    ElMessage({ message: '播放地址已复制', type: 'success' })
  }
  catch (error) {
    console.error('[ReviewPlayer.vue] 复制播放地址失败:', error)
    ElMessage({ message: '复制失败，请手动选取地址', type: 'error' })
  }
}

function togglePlay() {
  const mediaElement = getActiveMediaElement()
  if (!mediaElement)
    return
  if (mediaElement.paused)
    void mediaElement.play()
  else
    mediaElement.pause()
}

function toggleDanmaku() {
  settings.enabled = !settings.enabled
  if (!settings.enabled)
    clearOverlay()
  saveDanmakuSettings()
}

function toggleFullscreen() {
  // 对 video-box-inner 请求全屏，弹幕叠加层才会跟着一起放大
  const target = videoBoxRef.value
  if (!target)
    return
  if (document.fullscreenElement)
    void document.exitFullscreen()
  else
    void target.requestFullscreen()
}

// 快捷键绑定在根节点而不是 window：回放页会以多标签形式同时存在多个实例，
// 只有获得焦点的那个才应该响应按键。
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
    return

  // 空格与方向键原生 controls 自身就会响应，焦点落在媒体元素或按钮上时必须交还给原生：
  // 否则会出现 keydown 由本组件暂停、keyup 又被按钮的默认激活行为恢复播放的重复触发。
  const nativeOwnsKey = event.key === ' ' || event.key.startsWith('Arrow')
  const focusInNativeControl = target
    && (target.tagName === 'VIDEO' || target.tagName === 'AUDIO' || target.tagName === 'BUTTON')
  if (nativeOwnsKey && focusInNativeControl)
    return

  const mediaElement = getActiveMediaElement()
  switch (event.key) {
    case ' ':
      togglePlay()
      break
    case 'ArrowLeft':
      if (mediaElement)
        mediaElement.currentTime = Math.max(0, mediaElement.currentTime - 5)
      break
    case 'ArrowRight':
      if (mediaElement)
        mediaElement.currentTime = mediaElement.currentTime + 5
      break
    case 'ArrowUp':
      if (mediaElement)
        mediaElement.volume = Math.min(1, mediaElement.volume + 0.1)
      break
    case 'ArrowDown':
      if (mediaElement)
        mediaElement.volume = Math.max(0, mediaElement.volume - 0.1)
      break
    case 'd':
    case 'D':
      toggleDanmaku()
      break
    case 'f':
    case 'F':
      toggleFullscreen()
      break
    default:
      return
  }
  event.preventDefault()
}

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

function getReviewDownloadFilename() {
  const date = Tools.dateFormat(Number.parseInt(String(props.startTime)), 'yyyyMMddhhmm')
  return `${realName.value}${date}.mp4`
}

async function download() {
  const valid = await checkDownloadDirectory()
  if (!valid)
    return

  const filename = getReviewDownloadFilename()
  const downloadTask: TaskPayload = {
    url: playStreamPath.value,
    filename,
    liveId: props.liveId,
  }
  EventBus.emit('change-selected-menu', 'downloads')
  router.push('/downloads')
  setTimeout(() => {
    EventBus.emit('download-task', downloadTask)
  })
}

// 组件卸载时该 watch 会随作用域自动停止，无需手动持有停止函数
watch(
  () => playStreamPath.value,
  async (newPath) => {
    if (!newPath)
      return

    // 电台录播会在 isRadio 切换后把 <video> 替换成 <audio>，
    // 这里等一轮 DOM 更新，确保拿到正确的媒体节点再挂载播放源。
    await nextTick()
    attachPlaybackSource(newPath)
  },
  { flush: 'post' },
)

// 标签页切换：切走时暂停并记账，切回时只恢复那些因切走而暂停的播放
watch(
  () => props.active,
  (isActive) => {
    const mediaElement = getActiveMediaElement()
    if (!mediaElement)
      return
    if (isActive) {
      rootRef.value?.focus()
      if (pausedByInactive) {
        pausedByInactive = false
        void mediaElement.play().catch(() => {})
      }
    }
    else if (!mediaElement.paused) {
      pausedByInactive = true
      mediaElement.pause()
    }
  },
)

onMounted(async () => {
  loadDanmakuSettings()
  startDanmakuAnimation()
  if (props.active)
    rootRef.value?.focus()
  await getOne()
})

onUnmounted(() => {
  stopDanmakuAnimation()
  destroyPlayer()
  releaseSleepBlocker()
})
</script>

<template>
  <div ref="rootRef" class="review-player" tabindex="-1" @keydown="onKeydown">
    <el-header class="header-box">
      <img :src="userAvatar" alt="avatar" class="header-avatar">
      <span class="header-title" :title="liveTitle">{{ liveTitle }}</span>
      <el-tooltip :content="playStreamPath || '播放地址加载中'" placement="bottom">
        <el-button @click="copyStreamPath">
          复制地址
        </el-button>
      </el-tooltip>
      <el-popover trigger="click" placement="bottom-end" :width="260">
        <template #reference>
          <el-button>弹幕设置</el-button>
        </template>
        <div class="danmaku-settings">
          <div class="setting-row">
            <span>显示弹幕</span>
            <el-switch :model-value="settings.enabled" @change="toggleDanmaku" />
          </div>
          <div class="setting-row column">
            <span>不透明度</span>
            <el-slider v-model="settings.opacity" :min="0.2" :max="1" :step="0.1" @change="saveDanmakuSettings" />
          </div>
          <div class="setting-row column">
            <span>字号</span>
            <el-slider v-model="settings.fontSize" :min="14" :max="40" :step="2" @change="saveDanmakuSettings" />
          </div>
          <div class="setting-row column">
            <span>速度</span>
            <el-slider v-model="settings.speed" :min="80" :max="400" :step="20" @change="saveDanmakuSettings" />
          </div>
          <div class="setting-row column">
            <span>显示区域</span>
            <el-radio-group v-model="settings.area" size="small" @change="saveDanmakuSettings">
              <el-radio-button :value="0.25">
                顶部
              </el-radio-button>
              <el-radio-button :value="0.5">
                半屏
              </el-radio-button>
              <el-radio-button :value="1">
                全屏
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </el-popover>
      <el-button @click="sidebarVisible = !sidebarVisible">
        {{ sidebarVisible ? '隐藏弹幕列表' : '显示弹幕列表' }}
      </el-button>
      <el-button type="success" @click="download">
        下载
      </el-button>
    </el-header>

    <div class="review-content">
      <div class="video-box">
        <div ref="videoBoxRef" class="video-box-inner">
          <div v-if="isRadio" class="radio-player">
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
              class="audio-player"
            />
          </div>
          <video
            v-else
            ref="nativeVideo"
            class="video-player"
            controls
          />

          <div
            v-show="settings.enabled"
            class="danmaku-container"
            :style="{ opacity: settings.opacity, fontSize: `${settings.fontSize}px` }"
          >
            <div
              v-for="item in danmakuOverlayItems"
              :key="item.id"
              :ref="el => setDanmakuNode(item, el as HTMLElement | null)"
              class="danmaku-item"
            >
              {{ item.content }}
            </div>
          </div>

          <div v-if="mediaLoading && !lastPlaybackError" class="video-mask">
            <el-icon class="is-loading mask-icon">
              <Loading />
            </el-icon>
            <span>正在加载录播…</span>
          </div>
          <div v-else-if="mediaBuffering" class="video-mask buffering">
            <span>缓冲中…</span>
          </div>
          <div v-if="lastPlaybackError" class="video-mask error">
            <span>{{ lastPlaybackError }}</span>
            <div class="mask-actions">
              <el-button size="small" type="primary" @click="retryPlayback">
                重试
              </el-button>
              <el-button size="small" @click="copyStreamPath">
                复制地址
              </el-button>
              <el-button size="small" type="success" @click="download">
                去下载
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div v-show="sidebarVisible" class="barrage-box">
        <BarrageBox
          :number="number"
          :start-time="startTime"
          :barrage-loaded="barrageLoaded"
          :items="barrageListItems"
          :all-items="barrageEntries"
          @seek="seekTo"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.review-player {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  outline: none;
}

.header-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  flex-shrink: 0;
}

.header-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
}

.header-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 视频占主区域，弹幕列表定宽侧栏；min-height/min-width 为 0 让高度链正确收缩 */
.review-content {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.video-box {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  background: #000;
}

.barrage-box {
  width: 360px;
  flex-shrink: 0;
  min-height: 0;
  background: #fafbfc;
}

.video-box-inner {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.danmaku-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
  z-index: 10;
  /* 字号由脚本通过内联 style 注入，保证与 measureText 使用同一数值 */
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}

.danmaku-item {
  position: absolute;
  top: 0;
  left: 0;
  white-space: nowrap;
  font: inherit;
  color: #fff;
  text-shadow:
    2px 0 0 #000,
    -2px 0 0 #000,
    0 2px 0 #000,
    0 -2px 0 #000,
    1px 1px 0 #000,
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000;
  will-change: transform;
  user-select: none;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: absolute;
  top: 0;
  left: 0;
}

.video-mask {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #fff;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

.video-mask.error {
  background: rgba(0, 0, 0, 0.72);
  pointer-events: auto;
}

.video-mask.buffering {
  background: transparent;
}

.mask-icon {
  font-size: 28px;
}

.mask-actions {
  display: flex;
  gap: 8px;
}

.danmaku-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.setting-row.column {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.radio-player {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  box-sizing: border-box;
}

.radio-carousel {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
}

.radio-cover {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.audio-player {
  width: min(560px, 100%);
  flex-shrink: 0;
}

:deep(.el-carousel__container) {
  height: 100%;
}

:deep(.el-carousel) {
  width: 100%;
  height: 100%;
}

:deep(.el-carousel__item) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
