<script setup lang="ts">
import type { DanmakuSettings } from '../composables/use-danmaku-settings'
import type { TaskPayload } from '../services/task-payload'
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BarrageBox from '../components/BarrageBox.vue'
import { useBarrageList } from '../composables/use-barrage-list'
import { useDanmakuOverlay } from '../composables/use-danmaku-overlay'
import { useDanmakuSettings } from '../composables/use-danmaku-settings'
import { useDownloadGuard } from '../composables/use-download-guard'
import { usePlaybackEngine } from '../composables/use-playback-engine'
import { useSleepBlocker } from '../composables/use-sleep-blocker'
import useTasks from '../composables/use-tasks'
import { useVideoRotation } from '../composables/use-video-rotation'

import Apis from '../services/apis'
import Tools from '../utils/tools'
import BarrageSidebarToggle from './BarrageSidebarToggle.vue'
import DanmakuSettingsPopover from './DanmakuSettingsPopover.vue'
import MediaIcon from './MediaIcon.vue'
import MiniControls from './MiniControls.vue'
import PlayerLoading from './PlayerLoading.vue'
import RadioStage from './RadioStage.vue'
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

const emit = defineEmits(['avatar', 'aspect', 'sidebar'])

const playStreamPath = ref('')
const isRadio = ref(false)
const number = ref(0)
const nativeVideo = ref<HTMLVideoElement | null>(null)
// 电台模式的 audio 元素由 RadioStage 挂载/卸载时经 @audio 事件回传
const nativeAudio = ref<HTMLAudioElement | null>(null)
const currentTime = ref(0)
const carousels = ref<string[]>([])
const carouselTime = ref(5000)
const barrageUrl = ref('')
// 是否有弹幕数据源：无弹幕时隐藏弹幕叠加层、右缘切换竖条与弹幕侧栏
const hasBarrage = computed(() => !!barrageUrl.value)
const realName = ref('')
const userAvatar = ref('')
const sidebarVisible = ref(true)

// 侧栏实际占位（有弹幕数据且未收起）上报给浮窗：
// 无弹幕或收起弹幕列表时，放大窗不预留侧栏宽，画面不留空白
watch(
  [hasBarrage, sidebarVisible],
  ([has, visible]) => emit('sidebar', has && visible),
  { immediate: true },
)

// 弹幕数据源与右侧列表游标（引擎见 composables/use-barrage-list.ts）
const {
  entries: barrageEntries,
  items: barrageListItems,
  loaded: barrageLoaded,
  load: loadBarrages,
  buildUpTo: buildListUpTo,
  advanceTo: advanceListTo,
  reset: resetBarrages,
} = useBarrageList()

// 弹幕显示设置（localStorage 持久化见 composables/use-danmaku-settings.ts）
const {
  settings,
  load: loadDanmakuSettings,
  save: saveDanmakuSettings,
} = useDanmakuSettings()

/** 设置弹层里改动的参数统一在这里落库 */
function onDanmakuSettingsUpdate(patch: Partial<DanmakuSettings>) {
  Object.assign(settings, patch)
  saveDanmakuSettings()
}

const router = useRouter()

// 录播页只做两类事情：
// 1. 按播放地址选择 HLS 或原生 MP4 播放（use-playback-engine）
// 2. 按录播资源加载弹幕，并在回退/重播时重置弹幕状态
function getActiveMediaElement() {
  return isRadio.value ? nativeAudio.value : nativeVideo.value
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

// 迷你条拖进度：录播必须可 seek，弹幕游标由 onseeking 统一同步
function onMiniSeek(value: number) {
  const mediaElement = getActiveMediaElement()
  if (!mediaElement)
    return
  mediaElement.currentTime = value
  currentTime.value = value
}
// =========== 画面旋转结束 ===========

// =========== 视频弹幕叠加层（引擎已抽离至 composables/use-danmaku-overlay.ts） ===========
const {
  items: danmakuOverlayItems,
  setNode: setDanmakuNode,
  spawnUpTo: processOverlayDanmaku,
  seekTo: seekOverlayTo,
  clear: clearOverlay,
  start: startDanmakuAnimation,
  stop: stopDanmakuAnimation,
} = useDanmakuOverlay({
  videoBoxRef,
  getMedia: getActiveMediaElement,
  getEntries: () => barrageEntries.value,
  settings,
})

// seek / 重播统一入口：叠加层游标二分定位，列表按“从头到当前”重建
function seekBarragesTo(time: number) {
  seekOverlayTo(time)
  buildListUpTo(time)
  currentTime.value = time
}
// =========== 视频弹幕叠加层结束 ===========

// 播放防休眠（use-sleep-blocker，与 LivePlayer 共用）
const { acquire: acquireSleepBlocker, release: releaseSleepBlocker } = useSleepBlocker()

async function ensureBarragesLoaded() {
  // 弹幕晚于播放到达时，按当前进度补齐列表与叠加层
  if (await loadBarrages(barrageUrl.value))
    seekBarragesTo(getActiveMediaElement()?.currentTime ?? 0)
}

// 播放引擎：HLS/原生选择与三态由 use-playback-engine 维护，这里只做业务接线
const {
  loading: mediaLoading,
  buffering: mediaBuffering,
  error: lastPlaybackError,
  attach: attachPlaybackSource,
  destroy: destroyPlayer,
} = usePlaybackEngine({
  getMediaElement: getActiveMediaElement,
  getManagedElements: () => [nativeVideo.value, nativeAudio.value],
  onTimeUpdate,
  onSeeking: time => seekBarragesTo(time),
  onMetadataLoaded: async (mediaElement) => {
    // 记录源尺寸供旋转缩放计算，并按（可能旋转后的）画面比例上报浮窗
    if (!isRadio.value)
      updateVideoDimensions()
    mediaDuration.value = mediaElement.duration || 0
    await ensureBarragesLoaded()
  },
  onPlaying: () => void acquireSleepBlocker(),
  onIdle: releaseSleepBlocker,
})

function retryPlayback() {
  if (!playStreamPath.value)
    return
  attachPlaybackSource(playStreamPath.value)
}

async function getOne() {
  try {
    if (props.source === 'open') {
      // 开放公演回放：getOpenLiveOne 返回 playStreams 数组（VOD m3u8），优先选超清（streamType 3），回落高清 2 与任意可用流，
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
      resetBarrages()
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
  advanceListTo(newTime)
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
// 注：LivePlayer 走的是另一套「hover 检测」策略（无焦点概念），两边改动请互相参照。
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

// 下载目录校验与 LivePlayer/ReviewPlayer 共用（use-download-guard）
const { checkDownloadDirectory } = useDownloadGuard()

function getReviewDownloadFilename() {
  return Tools.taskFilename(realName.value, Number.parseInt(String(props.startTime)), 'mp4')
}

// 任务由 useTasks 共享 store 直接接住并下发
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
          <RadioStage
            v-if="isRadio"
            :carousels="carousels"
            :interval="carouselTime"
            @audio="nativeAudio = $event"
            @play="playing = true"
            @pause="playing = false"
            @volumechange="onVolumeChange"
          />
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

          <PlayerLoading
            v-if="mediaLoading && !lastPlaybackError"
            label="正在加载录播"
            hint="连接回放源中，请稍候"
          />
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
            <!-- 旋转控制（分段胶囊交互见 RotationControls.vue 头部注释） -->
            <RotationControls
              v-if="!isRadio && !mediaLoading"
              :angle="rotationAngle"
              @rotate-left="rotateLeft"
              @rotate-right="rotateRight"
              @reset="resetRotation"
            />
            <el-tooltip :content="downloading ? '下载中，点击取消' : '下载'" placement="bottom" :show-after="400">
              <button
                class="action-btn action-btn--download"
                :class="{ 'is-active': downloading }"
                :aria-label="downloading ? '取消下载' : '下载'"
                @click="onDownloadClick"
              >
                <MediaIcon name="download" :size="16" />
              </button>
            </el-tooltip>
          </div>

          <!-- 控制条：录播与电台回放都保留拖动进度 seek -->
          <MiniControls
            v-if="!mediaLoading"
            :playing="playing"
            :muted="muted"
            :is-fullscreen="isFullscreen"
            :show-pip="!isRadio"
            :is-pip="isPip"
            :show-progress="true"
            :current-time="currentTime"
            :duration="mediaDuration"
            :compact="compact"
            @toggle-play="togglePlay"
            @toggle-mute="toggleMute"
            @toggle-fullscreen="toggleFullscreen"
            @toggle-pip="togglePip"
            @seek="onMiniSeek"
          />

          <div v-if="rotateHint" class="rotate-hint">
            {{ rotateHint }}
          </div>

          <!-- 视频窗口右边缘：hover 时才浮出的弹幕列表显隐竖条 -->
          <BarrageSidebarToggle
            v-if="!compact && hasBarrage"
            :visible="sidebarVisible"
            @toggle="sidebarVisible = !sidebarVisible"
          />
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
            <DanmakuSettingsPopover
              :settings="settings"
              @update="onDanmakuSettingsUpdate"
              @toggle="toggleDanmaku"
            />
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

/* 悬浮按钮（下载）与右上角容器样式为全局 .player-actions / .action-btn，见 app.scss */

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
  /* 宽度与 utils/float-player-layout.ts 的 BARRAGE_SIDEBAR_WIDTH 同步（浮窗放大档按此预留侧栏位） */
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

.mask-actions {
  display: flex;
  gap: 8px;
}
</style>
