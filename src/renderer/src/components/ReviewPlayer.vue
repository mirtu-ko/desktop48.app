<script setup lang="ts">
import type { DownloadTaskPayload } from '../assets/js/task-payload'
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { cloneDeep } from 'lodash'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import EventBus from '../assets/js/event-bus'
import Tools from '../assets/js/tools'

import BarrageBox from '../components/BarrageBox.vue'

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
  startTime: { type: Number, required: true },
})

const playStreamPath = ref('')
const isReview = ref(false)
const isRadio = ref(false)
const number = ref(0)
const nativeVideo = ref<HTMLVideoElement | null>(null)
const nativeAudio = ref<HTMLAudioElement | null>(null)
const currentTime = ref(0)
const coverImage = ref('')
const carousels = ref<string[]>([])
const carouselTime = ref(5000)
const barrageUrl = ref('')
const barrageLoaded = ref(false)
const barrageList = ref<any[]>([])
const barrageBoxRef = ref()
const finalBarrageList = ref<any[]>([])
const loadedBarrageUrl = ref('')
const realName = ref('')
const userAvatar = ref('')
const powerSaveBlockerId = ref<number | null>(null)

const router = useRouter()

let hlsInstance: Hls | null = null
let stopPlayPathWatch: (() => void) | null = null

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
  mediaElement.onloadedmetadata = null
  mediaElement.onerror = null
}

function destroyPlayer() {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }

  resetMediaElement(nativeVideo.value)
  resetMediaElement(nativeAudio.value)
}

function resetBarragesForPlayback() {
  barrageBoxRef.value?.clear?.()
  barrageList.value = cloneDeep(finalBarrageList.value)
  currentTime.value = 0
}

function attemptAutoplay(mediaElement: HTMLMediaElement) {
  mediaElement.autoplay = true
  void Promise.resolve(mediaElement.play()).catch((error) => {
    console.error('[ReviewPlayer.vue] 自动播放失败:', error)
  })
}

async function ensureBarragesLoaded() {
  if (!barrageUrl.value || loadedBarrageUrl.value === barrageUrl.value)
    return

  try {
    const response = await Apis.instance().barrage(barrageUrl.value)
    barrageLoaded.value = true
    loadedBarrageUrl.value = barrageUrl.value
    finalBarrageList.value = Tools.lyricsParse(response)
    resetBarragesForPlayback()
  }
  catch (error: any) {
    console.error(error)
    ElMessage({ message: '弹幕加载失败', type: 'error' })
  }
}

function bindMediaEvents(mediaElement: HTMLMediaElement) {
  mediaElement.ontimeupdate = (e) => {
    const target = (e?.target as HTMLMediaElement) || getActiveMediaElement()
    if (!target)
      return
    onTimeUpdate(target.currentTime)
  }

  mediaElement.onloadedmetadata = async (e) => {
    const target = (e?.target as HTMLMediaElement) || getActiveMediaElement()
    if (!target)
      return

    await ensureBarragesLoaded()
    attemptAutoplay(target)
  }

  mediaElement.onerror = () => {
    console.error('[ReviewPlayer.vue] 录播播放失败:', playStreamPath.value)
  }
}

// 录播是 VOD 场景，保留 HLS 最合适；如果是 MP4 则直接交给原生 video。
function attachPlaybackSource(newPath: string) {
  const mediaElement = getActiveMediaElement()
  if (!mediaElement)
    return

  destroyPlayer()

  if (newPath.endsWith('.m3u8')) {
    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsInstance = hls
      hls.loadSource(newPath)
      hls.attachMedia(mediaElement)
    }
    else if (mediaElement.canPlayType('application/vnd.apple.mpegurl')) {
      mediaElement.src = newPath
    }
    else {
      ElMessage.error('当前环境不支持录播 HLS 播放')
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

async function getOne() {
  try {
    const data = await Apis.instance().live(props.liveId)
    console.log('获取到的录播信息:', data)

    const nextPlayStreamPath = Tools.streamPathHandle(data.playStreamPath, props.startTime)
    const nextBarrageUrl = data.msgFilePath || ''

    isReview.value = data.review
    if (!isReview.value) {
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
    coverImage.value = carousels.value[0] || ''

    const barrageSourceChanged = barrageUrl.value !== nextBarrageUrl
    barrageUrl.value = nextBarrageUrl
    playStreamPath.value = nextPlayStreamPath

    if (barrageSourceChanged) {
      barrageLoaded.value = false
      loadedBarrageUrl.value = ''
      finalBarrageList.value = []
      barrageList.value = []
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

function onTimeUpdate(newTime: number) {
  if (newTime < currentTime.value) {
    resetBarragesForPlayback()
    currentTime.value = newTime
  }
  else {
    currentTime.value = newTime
  }

  for (let i = 0; i < barrageList.value.length;) {
    const item = barrageList.value[i]
    if (Tools.timeToSecond(item.time) <= newTime - 1) {
      barrageBoxRef.value?.shoot?.({
        content: item.content,
        username: item.username,
        time: item.time,
      })
      barrageList.value.shift()
    }
    else {
      break
    }
  }
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
  const extension = playStreamPath.value.endsWith('.m3u8') ? 'mp4' : 'mp4'
  return `${realName.value}${date}.${extension}`
}

async function download() {
  const valid = await checkDownloadDirectory()
  if (!valid)
    return

  const filename = getReviewDownloadFilename()
  const downloadTask: DownloadTaskPayload = {
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

onMounted(async () => {
  console.log('[ReviewPlayer.vue] onMounted', props)
  powerSaveBlockerId.value = await window.mainAPI.preventSleep()
  stopPlayPathWatch = watch(
    () => playStreamPath.value,
    async (newPath) => {
      if (!newPath)
        return

      // 电台录播会在 isRadio 切换后把 <video> 替换成 <audio>，
      // 这里等一轮 DOM 更新，确保拿到正确的媒体节点再挂载播放源。
      await nextTick()
      attachPlaybackSource(newPath)
    },
    {
      immediate: true,
      flush: 'post',
    },
  )
  await getOne()
})

onUnmounted(() => {
  destroyPlayer()
  if (stopPlayPathWatch) {
    stopPlayPathWatch()
    stopPlayPathWatch = null
  }
  if (powerSaveBlockerId.value !== null)
    window.mainAPI.allowSleep(powerSaveBlockerId.value)
})
</script>

<template>
  <div class="review-container">
    <el-header class="header-box">
      <div style="display: flex; align-items: center; width: 100%;">
        <img :src="userAvatar" alt="Logo" style="width: 32px; height: 32px; margin-right: 12px; border-radius: 50%;">
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 12px;" :title="liveTitle">
          {{ liveTitle }}
        </span>
        <el-tooltip style="flex-shrink: 0;" :content="playStreamPath">
          <el-button type="primary">
            视频地址
          </el-button>
        </el-tooltip>
        <el-button type="success" style="flex-shrink: 0;" @click="download">
          下载
        </el-button>
      </div>
    </el-header>

    <div class="review-content">
      <el-row justify="space-between" class="review-row">
        <el-col :span="10" class="video-box">
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
              <div v-else class="radio-cover-placeholder">
                <img v-if="coverImage" :src="coverImage" class="radio-cover" alt="cover">
              </div>
            </div>
            <audio
              ref="nativeAudio"
              controls
              autoplay
              class="audio-player"
            />
          </div>
          <video
            v-else
            ref="nativeVideo"
            class="video-player"
            controls
            autoplay
            :poster="coverImage"
          />
        </el-col>
        <el-col :span="13" class="barrage-box">
          <BarrageBox
            ref="barrageBoxRef" :number="number" :start-time="startTime" :barrage-loaded="barrageLoaded"
            style="height: 100%;"
          />
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped lang="scss">
.video-box {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  position: relative;
  max-height: 960px;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: absolute;
  top: 0;
  left: 0;
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

.radio-cover,
.radio-cover-placeholder {
  width: 100%;
  height: 100%;
}

.radio-cover {
  object-fit: contain;
  display: block;
}

.audio-player {
  width: min(560px, 100%);
  flex-shrink: 0;
}

.review-container {
  height: calc(100% - 60px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.review-content,
.review-row {
  flex: 1;
  height: 100%;
  overflow: hidden;
}

.barrage-box {
  min-height: 480px;
  height: 100%;
}

.video-box,
.barrage-box {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.barrage-box {
  background: #fafbfc;
}

.video-box::-webkit-scrollbar,
.barrage-box::-webkit-scrollbar {
  display: none;
}

.video-box,
.barrage-box {
  -ms-overflow-style: none;
  scrollbar-width: none;
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

:deep(.el-card__body) {
  height: calc(100% - 60px);
}
</style>
