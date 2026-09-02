<script setup lang="ts">
import type { TaskPayload } from '../services/task-payload'
import type { BarrageListItem } from './Barrage.vue'
import { ChatDotRound, Download, Loading, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import BarrageBox from '../components/BarrageBox.vue'
import useTasks from '../composables/use-tasks'
import { useVideoRotation } from '../composables/use-video-rotation'

import Apis from '../services/apis'
import Tools from '../utils/tools'
import MiniControls from './MiniControls.vue'
import RotationControls from './RotationControls.vue'

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
  startTime: { type: Number, required: true },
  /** 数据源：user=用户直播回放(getLiveOne)，open=开放公演回放(getOpenLiveOne) */
  source: { type: String, default: 'user' },
  /** open 模式下的顶部头像（队伍 logo，完整 URL） */
  avatarUrl: { type: String, default: '' },
  /** 迷你窗紧凑模式：隐藏弹幕侧栏与对应头部按钮，适配画中画小窗口 */
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['avatar', 'orientation'])

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
// 是否有弹幕数据源：无弹幕时隐藏弹幕叠加层、右缘切换竖条与弹幕侧栏
const hasBarrage = computed(() => !!barrageUrl.value)
const realName = ref('')
const userAvatar = ref('')
const powerSaveBlockerId = ref<number | null>(null)
const lastPlaybackError = ref('')
const mediaLoading = ref(true)
const mediaBuffering = ref(false)
const sidebarVisible = ref(true)

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

// =========== 画面旋转 / 容器全屏 / 迷你控制条（与 LivePlayer 共用 useVideoRotation） ===========
// 旋转作用于 video wrapper，弹幕叠加层与之同级、不参与旋转：
// 弹幕的轨道/坐标体系基于容器宽高，保持横向滚动即可，旋转不影响弹幕任何逻辑。
const mediaDuration = ref(0)

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

// 迷你条拖进度：录播必须可 seek，弹幕游标由 onseeking 统一同步
function onMiniSeek(value: number) {
  const mediaElement = getActiveMediaElement()
  if (!mediaElement)
    return
  mediaElement.currentTime = value
  currentTime.value = value
}
// =========== 画面旋转结束 ===========

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
    // 记录源尺寸供旋转缩放计算，并按（可能旋转后的）画面比例上报浮窗
    if (!isRadio.value)
      updateVideoDimensions()
    mediaDuration.value = mediaElement.duration || 0
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
    if (props.source === 'open') {
      // 开放公演回放：getOpenLiveOne 返回 playStreams 数组（VOD m3u8），优先选高清（streamType 2），
      // 详情里没有用户与在线人数信息，用公演标题与传入的队伍 logo 兜底
      const data = await Apis.instance().openLive(props.liveId)
      const streams: Array<{ streamPath: string, streamType: number }> = data.playStreams || []
      const stream = streams.find(s => s.streamType === 3 && s.streamPath)
        || streams.find(s => s.streamType === 2 && s.streamPath)
        || streams.find(s => s.streamPath)
      if (!stream?.streamPath) {
        ElMessage({ message: '未获取到公演回放地址', type: 'error' })
        return
      }
      isRadio.value = false
      number.value = 0
      realName.value = data.subTitle || data.title || '开放公演'
      userAvatar.value = props.avatarUrl
      emit('avatar', userAvatar.value)
      barrageUrl.value = data.msgFilePath || ''
      playStreamPath.value = stream.streamPath
      return
    }

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
    emit('avatar', userAvatar.value)
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

// 切换弹幕显隐：状态持久化到 localStorage，关闭时清空叠加层，重新打开不补灌历史弹幕
function toggleDanmaku() {
  // 无弹幕数据源时开关无意义，直接忽略（含快捷键 D）
  if (!hasBarrage.value)
    return
  settings.enabled = !settings.enabled
  if (!settings.enabled)
    clearOverlay()
  saveDanmakuSettings()
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
    // 空格/播放键与迷你条统一走 useVideoRotation 的 togglePlay（getMedia 即 getActiveMediaElement）
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
    case 'r':
    case 'R':
      // 长按 repeat 只响应第一次，避免连续转圈
      if (event.repeat)
        return
      if (event.shiftKey)
        rotateLeft()
      else
        rotateRight()
      break
    case '0':
      if (event.repeat)
        return
      resetRotation()
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

// 任务通过共享 store 直接下发，不再绕 EventBus 中转
const { handleTask, isTaskRunning, stopTask } = useTasks()
const downloading = computed(() => isTaskRunning('download', props.liveId))

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
  // 任务由 useTasks 这个模块级单例直接接住并启动，状态在按钮上就地可见，
  // 不再跳转下载页——播放器本身也是浮窗，跳走反而打断浏览
  await handleTask(downloadTask, 'download')
}

/** 下载中再次点击 = 取消下载 */
function onDownloadClick() {
  if (!downloading.value) {
    download()
    return
  }
  stopTask('download', props.liveId)
  ElMessage({ message: '已停止下载', type: 'info' })
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

onMounted(async () => {
  loadDanmakuSettings()
  startDanmakuAnimation()
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
    <div class="review-content">
      <div class="video-box">
        <div
          ref="videoBoxRef"
          class="video-box-inner"
          :class="{ 'vertical-rotation': !isRadio && isVerticalRotation }"
          @dblclick="onBoxDblClick"
        >
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
            <!-- 音频仅作媒体源，不渲染原生控件（播控走 MiniControls） -->
            <audio
              ref="nativeAudio"
              class="audio-player"
              @play="playing = true"
              @pause="playing = false"
              @volumechange="onVolumeChange"
            />
          </div>
          <div v-else class="video-wrapper" :style="videoWrapperStyle">
            <video
              ref="nativeVideo"
              class="video-player"
              :style="videoStyle"
              @play="playing = true"
              @pause="playing = false"
              @volumechange="onVolumeChange"
            />
          </div>

          <div
            v-show="settings.enabled && hasBarrage"
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
              <el-button size="small" type="success" @click="onDownloadClick">
                {{ downloading ? '取消下载' : '去下载' }}
              </el-button>
            </div>
          </div>

          <div class="player-actions">
            <!-- 旋转三件套：与 LivePlayer 一致的分段胶囊，中段显示当前角度，点击归零 -->
            <RotationControls
              v-if="!isRadio"
              :angle="rotationAngle"
              @rotate-left="rotateLeft"
              @rotate-right="rotateRight"
              @reset="resetRotation"
            />
            <el-button
              circle
              class="action-btn action-download"
              :class="{ 'is-downloading': downloading }"
              :title="downloading ? '下载中，点击取消' : '下载'"
              @click="onDownloadClick"
            >
              <el-icon :class="{ 'is-loading': downloading }">
                <Loading v-if="downloading" />
                <Download v-else />
              </el-icon>
            </el-button>
          </div>

          <!-- 全自绘控制条：录播保留 seek，电台回放同样可拖进度 -->
          <MiniControls
            v-if="!mediaLoading"
            :playing="playing"
            :muted="muted"
            :is-fullscreen="isFullscreen"
            :show-progress="true"
            :current-time="currentTime"
            :duration="mediaDuration"
            @toggle-play="togglePlay"
            @toggle-mute="toggleMute"
            @toggle-fullscreen="toggleFullscreen"
            @seek="onMiniSeek"
          />

          <div v-if="rotateHint" class="rotate-hint">
            {{ rotateHint }}
          </div>

          <!-- 视频窗口右边缘：hover 时才浮出的弹幕列表显隐竖条（B站式边缘吸附） -->
          <div v-if="!compact && hasBarrage" class="sidebar-toggle">
            <div
              class="sidebar-toggle-tab"
              :title="sidebarVisible ? '隐藏弹幕列表' : '显示弹幕列表'"
              @click="sidebarVisible = !sidebarVisible"
            >
              <el-icon class="toggle-icon">
                <ChatDotRound />
              </el-icon>
              <span class="toggle-label">{{ sidebarVisible ? '收起' : '弹幕' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-show="sidebarVisible && !compact && hasBarrage" class="barrage-box">
        <BarrageBox
          :number="number"
          :start-time="startTime"
          :barrage-loaded="barrageLoaded"
          :items="barrageListItems"
          :all-items="barrageEntries"
          @seek="seekTo"
        >
          <template #actions>
            <el-popover trigger="click" placement="bottom-end" :width="260">
              <template #reference>
                <el-button circle class="side-setting-btn" title="弹幕设置">
                  <el-icon>
                    <Setting />
                  </el-icon>
                </el-button>
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
          </template>
        </BarrageBox>
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

/* 悬浮功能按钮：横排置于右上角（与直播播放器一致），避开顶部弹幕与底部原生控件 */
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

/* 统一按钮尺寸并水平居中，保证整列右缘对齐（下载按钮固定在底部） */
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

  &.is-active {
    --el-button-bg-color: rgba(109, 90, 224, 0.85);
    --el-button-border-color: rgba(109, 90, 224, 0.9);
  }
}

.action-download {
  --el-button-text-color: #7dd8a4;
  --el-button-hover-text-color: #4fd187;

  /* 下载中：常亮绿色底 + 呼吸光圈，与 LivePlayer 的录制中状态同构 */
  &.is-downloading {
    color: #fff;
    background: #34c07c;
    border-color: transparent;
    animation: download-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes download-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(52, 192, 124, 0.45);
  }
  50% {
    box-shadow: 0 0 0 6px transparent;
  }
}

/* 视频窗口右边缘的弹幕显隐竖条触发区：平时不可见，hover 到右缘才滑出 */
.sidebar-toggle {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 72px;
  box-sizing: border-box;
  padding-top: 96px;
  padding-bottom: 96px;
  z-index: 30;
}

/* B站式边缘吸附竖条：贴在右缘，仅左侧圆角，hover 时从边缘滑出 */
.sidebar-toggle-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 26px;
  height: 76px;
  box-sizing: border-box;
  padding: 8px 2px;
  border-radius: 10px 0 0 10px;
  background: rgba(109, 90, 224, 0.75);
  color: #fff;
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
  user-select: none;
  backdrop-filter: blur(6px);
  border-left: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.35);
  opacity: 0;
  transform: translateX(12px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.sidebar-toggle:hover .sidebar-toggle-tab {
  opacity: 1;
  transform: translateX(0);
}

.sidebar-toggle-tab:hover {
  background: rgba(109, 90, 224, 0.75);
}

.toggle-icon {
  font-size: 16px;
}

.toggle-label {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  font-weight: 500;
}

/* 弹幕列表面板搜索框右侧的设置按钮：小而圆，与右栏配色一致 */
.side-setting-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  margin-left: 0 !important;
  color: var(--el-text-color-secondary);
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
  background: var(--el-bg-color-page);
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

/* video-wrapper / video-player 公共样式见 app.scss */

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

/* 电台轮播铺满整个窗口，音频控件悬浮底部居中 */
.radio-player {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.radio-carousel {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
}

/* 轮播图铺满：object-fit: cover 裁边填充 */
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
