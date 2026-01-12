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
const nativeVideo = ref<HTMLVideoElement | null>(null) // 原生 video 播放器
const status = ref(0)
const currentTime = ref(0)
const duration = ref(0)
// 音频流时的封面图片
const carousels = ref<string[]>([])
const carouselTime = ref(5000)
const coverImage = ref('')
// 弹幕
const barrageUrl = ref('')
const barrageLoaded = ref(false)
const barrageList = ref<any[]>([])
const barrageBoxRef = ref()
const finalBarrageList = ref<any[]>([])
// 路由
const router = useRouter()

// 生命周期：onMounted/onUnmounted
const powerSaveBlockerId = ref<number | null>(null)

onMounted(async () => {
  console.log('[ReviewPlayer.vue] onMounted', props)
  getOne()
  watch(
    () => playStreamPath.value,
    (newPath) => {
      if (nativeVideo.value && newPath) {
        if (newPath.endsWith('.m3u8')) {
          if (Hls.isSupported()) {
            const hls = new Hls()
            hls.loadSource(newPath)
            hls.attachMedia(nativeVideo.value)
          }
          else if (nativeVideo.value.canPlayType('application/vnd.apple.mpegurl')) {
            nativeVideo.value.src = newPath
          }
        }
        else if (newPath.endsWith('.mp4')) {
          nativeVideo.value.src = newPath
          nativeVideo.value.load()
        }

        // 绑定原生 video 事件 (适用于 MP4 和部分 M3U8 场景)
        // 对于 Hls.js 控制的 M3U8，这些事件也应该在 video 元素上触发
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
  // 添加阻止休眠
  powerSaveBlockerId.value = await window.mainAPI.preventSleep()
})

onUnmounted(() => {
  // 移除阻止休眠
  if (powerSaveBlockerId.value !== null) {
    window.mainAPI.allowSleep(powerSaveBlockerId.value)
  }
})

const realName = ref('')
const userAvatar = ref('')
function getOne() {
  Apis.instance().live(props.liveId).then((data) => {
    console.log('获取到的录播信息:', data)
    playStreamPath.value = Tools.streamPathHandle(data.playStreamPath, props.startTime)
    isReview.value = data.review
    if (!isReview.value) {
      ElMessage({
        message: '该视频不是录播',
        type: 'warning',
      })
      router.push('/live')
      return
    }
    barrageUrl.value = data.msgFilePath
    isRadio.value = data.liveType == 2
    number.value = data.onlineNum
    realName.value = data.user.userName
    userAvatar.value = Tools.sourceUrl(data.user.userAvatar)
    if (isRadio.value) {
      carousels.value = data.carousels.carousels.map((carousel: any) => Tools.sourceUrl(carousel))
      carouselTime.value = Number.parseInt(data.carousels.carouselTime)
      coverImage.value = carousels.value[0]
    }
  }).catch((error: any) => {
    console.error(error)
  })
}

// 播放/暂停
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
defineExpose({ play, download })

// 时间更新
function onTimeUpdate(newTime: number) {
  if (newTime < currentTime.value) {
    // 重新加载弹幕
    barrageBoxRef.value?.clear()
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

// 加载弹幕
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

// 检查下载目录是否存在
function checkDownloadDirectory() {
  window.mainAPI.getConfig('downloadDirectory').then((result: any) => {
    if (!result) {
      ElMessage({
        message: '下载目录不存在，请先配置下载目录',
        type: 'warning',
      })
      router.push('/setting')
    }
  }).catch((error: any) => {
    console.error(error)
    ElMessage({ message: '检查下载目录失败', type: 'error' })
  })
}

// 下载录播
function download() {
  checkDownloadDirectory()
  const date = Tools.dateFormat(Number.parseInt(String(props.startTime)), 'yyyyMMddhhmm')
  const filename = `${realName.value}${date}.mp4`
  console.log('[ReviewPlayer.vue]playStreamPath:', playStreamPath.value, 'filename:', filename, 'liveId:', props.liveId)
  const downloadTask: any = new DownloadTask(playStreamPath.value, filename, props.liveId)
  EventBus.emit('change-selected-menu', Constants.Menu.DOWNLOADS)
  router.push('/downloads')
  setTimeout(() => {
    EventBus.emit('download-task', downloadTask)
  })
}
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
          <video
            ref="nativeVideo" class="video-player" controls :poster="isRadio ? coverImage : ''"
            :style="isRadio ? 'background: #000; object-fit: contain;' : ''"
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
  /* 不显示滚动条 */
  overflow: hidden;
}

.barrage-box {
  background: #fafbfc;
}

/* 隐藏所有滚动条（webkit/firefox/IE） */
.video-box::-webkit-scrollbar,
.barrage-box::-webkit-scrollbar {
  display: none;
}

.video-box,
.barrage-box {
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

:deep(.el-carousel__container) {
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
