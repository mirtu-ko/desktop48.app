<script setup lang="ts">
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { cloneDeep } from 'lodash'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import DownloadTask from '../assets/js/download-task'

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
const member = ref<any>({})
const player = ref<any>(null) // 保留用于控制播放/暂停等
const nativeVideo = ref<HTMLVideoElement | null>(null) // 原生 video 播放器
const isMuted = ref(false)
const status = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)
const carousels = ref<string[]>([])
const carouselTime = ref(5000)
// 音频流时的封面图片
const coverImage = ref('') // 你可以根据实际需求赋值，如 member.value.avatar 或其它图片
const barrageUrl = ref('')
const barrageLoaded = ref(false)
const barrageList = ref<any[]>([])
const finalBarrageList = ref<any[]>([])

// refs for child components
// const controlsRef = ref()
const barrageBoxRef = ref()
// 生命周期：onMounted/onUnmounted
onMounted(() => {
  getOne()
  watch(
    () => playStreamPath.value,
    (newPath) => {
      if (nativeVideo.value && newPath && newPath.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource(newPath)
          hls.attachMedia(nativeVideo.value)
        }
        else if (nativeVideo.value.canPlayType('application/vnd.apple.mpegurl')) {
          nativeVideo.value.src = newPath
        }
        // 绑定原生 video 事件
        nativeVideo.value.ontimeupdate = (e) => {
          const video = (e?.target as HTMLVideoElement) || nativeVideo.value
          if (!video)
            return
          onTimeUpdate(video.currentTime)
        }
        nativeVideo.value.onloadedmetadata = (e) => {
          const video = (e?.target as HTMLVideoElement) || nativeVideo.value
          if (!video)
            return
          duration.value = video.duration
          getBarrages()
        }
      }
    },
    { immediate: true },
  )
})
onUnmounted(() => {
  if (player.value != null) {
    player.value.destroy()
    console.info('player destroyed')
  }
})

function getOne() {
  Apis.instance().live(props.liveId).then((data) => {
    playStreamPath.value = Tools.streamPathHandle(data.playStreamPath, props.startTime)
    isReview.value = data.review
    barrageUrl.value = data.msgFilePath
    isRadio.value = data.liveType == 2
    number.value = data.onlineNum
    if (isRadio.value) {
      carousels.value = data.carousels.carousels.map((carousel: any) => Tools.sourceUrl(carousel))
      carouselTime.value = Number.parseInt(data.carousels.carouselTime)
    }
    // member.value = await window.mainAPI.getMember(data.user.userId) // 请确保主进程暴露此API
    initPlayer()
  }).catch((error: any) => {
    console.error(error)
  })
}

function initPlayer() {
  // 只保留必要的初始化逻辑
  if (player.value != null && player.value.destroy) {
    player.value.destroy()
  }
  // 设置音量
  if (player.value && player.value.volume) {
    // player.value.volume(await window.mainAPI.getConfig('volume', 80)) // 如需支持音量持久化，请主进程暴露此API
  }
  if (!isReview.value) {
    play()
  }
}

function play() {
  if (nativeVideo.value) {
    nativeVideo.value.play()
    status.value = Constants.STATUS_PLAYING
    console.log('play')
  }
  else {
    console.warn('nativeVideo is null')
  }
}

// 暴露方法给模板
defineExpose({ play, pause, mute, unmute, progressChange, volumeChange, fullScreen, download })
function pause() {
  if (nativeVideo.value) {
    nativeVideo.value.pause()
    status.value = Constants.STATUS_PREPARED
    console.log('pause')
  }
  else {
    console.warn('nativeVideo is null')
  }
}
function mute() {
  if (nativeVideo.value) {
    nativeVideo.value.muted = true
    isMuted.value = true
    console.log('mute')
  }
  else {
    console.warn('nativeVideo is null')
  }
}
function unmute() {
  if (nativeVideo.value) {
    nativeVideo.value.muted = false
    nativeVideo.value.volume = volume.value / 100
    isMuted.value = false
    console.log('unmute')
  }
  else {
    console.warn('nativeVideo is null')
  }
}
function progressChange(newTime: number) {
  if (nativeVideo.value) {
    nativeVideo.value.currentTime = newTime
    onTimeUpdate(newTime)
    console.log('progressChange')
  }
  else {
    console.warn('nativeVideo is null')
  }
}
function onTimeUpdate(newTime: number) {
  if (newTime < currentTime.value) {
    barrageList.value = cloneDeep(finalBarrageList.value)
  }
  currentTime.value = newTime
  // 重新加载弹幕
  for (let i = 0; i < barrageList.value.length;) {
    const item = barrageList.value[i]
    if (Tools.timeToSecond(item.time) <= newTime - 1) {
      if (barrageBoxRef.value && barrageBoxRef.value.shoot) {
        barrageBoxRef.value.shoot({
          content: item.content,
          username: item.username,
          time: item.time,
        })
      }
      barrageList.value.shift()
    }
    else {
      break
    }
  }
}
function volumeChange(val: number) {
  volume.value = val
  console.log('volumeChange')
  Database.instance().setConfig('volume', val)
}
function fullScreen() {
  if (nativeVideo.value) {
    if (nativeVideo.value.requestFullscreen) {
      nativeVideo.value.requestFullscreen()
    }
    else if ((nativeVideo.value as any).webkitRequestFullscreen) {
      (nativeVideo.value as any).webkitRequestFullscreen()
    }
    else if ((nativeVideo.value as any).msRequestFullscreen) {
      (nativeVideo.value as any).msRequestFullscreen()
    }
    console.log('fullScreen')
  }
  else {
    console.warn('nativeVideo is null')
  }
}
function getBarrages() {
  if (!barrageUrl.value || barrageUrl.value.length === 0)
    return
  Apis.instance().barrage(barrageUrl.value).then((response: any) => {
    barrageLoaded.value = true
    finalBarrageList.value = Tools.lyricsParse(response)
    barrageList.value = cloneDeep(finalBarrageList.value)
  }).catch((error: any) => {
    console.error(error)
    ElMessage({ message: '弹幕加载失败', type: 'error' })
  })
}
const router = useRouter()
function download() {
  const date = Tools.dateFormat(Number.parseInt(String(props.startTime)), 'yyyyMMddhhmm')
  const filename = `${member.value.realName} ${date}.mp4`
  const downloadTask: any = new DownloadTask(playStreamPath.value, filename, props.liveId)
  EventBus.emit('change-selected-menu', Constants.Menu.DOWNLOADS)
  router.push('/downloads')
  setTimeout(() => {
    EventBus.emit('download-task', downloadTask)
  })
}
</script>

<template>
  <el-container>
    <el-header class="header-box">
      <el-row :gutter="12" justify="space-between" style="width: 100%;">
        <el-col :span="16">
          <div style="display: flex; align-items: center; float: left">
            <span>{{ liveTitle }}</span>
          </div>
        </el-col>
        <el-col :span="8">
          <div style="display: flex; align-items: center; float: right">
            <el-tooltip :content="playStreamPath">
              <el-button type="primary">
                视频地址
              </el-button>
            </el-tooltip>
            <el-button type="success" @click="download">
              下载
            </el-button>
          </div>
        </el-col>
      </el-row>
    </el-header>

    <div>
      <el-row :gutter="12" class="review-row">
        <el-col :span="12" class="review-left">
          <el-card shadow="never">
            <template #extra>
              <span>{{ member.userName }}</span>
            </template>

            <div class="video-box">
              <video
                ref="nativeVideo" class="video" controls :poster="isRadio ? coverImage : ''"
                :style="isRadio ? 'background: #000; object-fit: contain;' : ''"
              />
            </div>
          </el-card>
        </el-col>
        <el-col :span="10" class="review-right">
          <BarrageBox
            ref="barrageBoxRef" :number="number" :start-time="startTime" :barrage-loaded="barrageLoaded"
            style="height: 100%; width: 100%;"
          />
        </el-col>
      </el-row>
    </div>
  </el-container>
</template>

<style scoped lang="scss">
:deep(.el-carousel__container) {
  height: 100%;
}

:deep(.el-carousel__item) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.video-box {
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-row {
  min-height: 480px;
}

.review-left,
.review-right {
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 不显示滚动条 */
  overflow: hidden;
}

.review-right {
  background: #fafbfc;
  /* 隐藏滚动条，兼容主流浏览器 */
  overflow: hidden;
}

/* 隐藏所有滚动条（webkit/firefox/IE） */
.review-left::-webkit-scrollbar,
.review-right::-webkit-scrollbar {
  display: none;
}

.review-left,
.review-right {
  -ms-overflow-style: none;
  /* IE and Edge */
  scrollbar-width: none;
  /* Firefox */
}

:deep(.el-carousel__container) {
  height: 100%;
}

:deep(.el-carousel__item) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
