<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Apis from '../assets/js/apis'

import Constants from '../assets/js/constants'
import EventBus from '../assets/js/event-bus'
import RecordTask from '../assets/js/record-task'
import Tools from '../assets/js/tools' // 添加手动卸载标记

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
  startTime: { type: Number, required: true },
})

const realName = ref('')
const userAvatar = ref('')

const playStreamPath = ref('')
const nativeVideo = ref<HTMLVideoElement | null>(null)
const streamId = ref('')
const videoBoxRef = ref<HTMLElement | null>(null)
const loading = ref(true)
const retryCount = ref(0)
const maxRetries = 3
const isManuallyUnmounted = ref(false)

// 视频旋转相关
const rotationAngle = ref(0)
const videoWidth = ref(0)
const videoHeight = ref(0)
const videoWH = ref(0)

// 容器尺寸响应式变量，用于触发重新计算
const boxDimensions = ref({ width: 0, height: 0 })

// 判断是否垂直旋转（90度或270度）
const isVerticalRotation = computed(() => {
  const normalizedAngle = ((rotationAngle.value % 360) + 360) % 360
  return normalizedAngle === 90 || normalizedAngle === 270
})

// 视频包装器的样式
const videoWrapperStyle = computed(() => {
  const angle = rotationAngle.value
  const vertical = isVerticalRotation.value

  // 访问 boxDimensions 以触发重新计算
  const box = boxDimensions.value
  const boxWidth = box.width || videoBoxRef.value?.clientWidth || 0
  const boxHeight = box.height || videoBoxRef.value?.clientHeight || 0

  // 计算缩放因子
  let scale = 1

  if (vertical && videoWidth.value > 0 && videoHeight.value > 0 && boxWidth > 0 && boxHeight > 0) {
    // 视频旋转90度或270度时，视频的实际显示宽高交换了
    // 原始宽度 w1 = videoWidth，原始高度 h1 = videoHeight
    // 旋转后显示宽度 = h1，显示高度 = w1
    // 需要让 h1 * scale <= boxWidth 且 w1 * scale <= boxHeight
    // 即 scale <= boxWidth/h1 且 scale <= boxHeight/w1
    const boxWH = boxWidth / boxHeight
    let videoW = 1
    let videoH = 1
    if (videoWH.value < boxWH) {
      videoH = boxHeight
      videoW = boxHeight * videoWH.value
    }
    else {
      videoW = boxWidth
      videoH = videoW / videoWH.value
    }
    const scale1 = boxWidth / videoH
    const scale2 = boxHeight / videoW
    scale = Math.min(scale1, scale2)

    console.log('[视频缩放计算] 垂直旋转:', vertical)
    console.log('[视频缩放计算] 容器尺寸: boxWidth =', boxWidth, ', boxHeight =', boxHeight)
    console.log('[视频缩放计算] 视频原始尺寸: videoWidth =', videoW, ', videoHeight =', videoH)
    console.log('[视频缩放计算] scale1 = boxWidth / videoHeight =', boxWidth, '/', videoH, '=', scale1)
    console.log('[视频缩放计算] scale2 = boxHeight / videoWidth =', boxHeight, '/', videoW, '=', scale2)
    console.log('[视频缩放计算] 最终 scale = min(scale1, scale2) =', scale)
  }
  else {
    console.log('[视频缩放计算] 非垂直旋转或尺寸无效:', { vertical, videoWidth: videoWidth.value, videoHeight: videoHeight.value, boxWidth, boxHeight })
  }

  if (vertical) {
    // 垂直旋转时，应用缩放
    return {
      transform: `rotate(${angle}deg) scale(${scale})`,
    }
  }

  return {
    transform: `rotate(${angle}deg) scale(1)`,
  }
})

// 视频元素的样式 - 处理垂直旋转时的宽高适配
const videoStyle = computed(() => {
  const vertical = isVerticalRotation.value

  if (vertical) {
    // 旋转90度或270度时，使用 contain 模式确保完整显示
    return {
      objectFit: 'contain' as const,
      maxWidth: '100%',
      maxHeight: '100%',
      width: 'auto',
      height: 'auto',
    }
  }

  return {}
})
const router = useRouter()

// 封面图片
const isRadio = ref(false)
const coverImage = ref('')
// const carousels = ref<string[]>([])
// const carouselTime = ref(5000)

// 获取直播信息
function getOne() {
  loading.value = true
  retryCount.value = 0 // 重置重试计数
  Apis.instance().live(props.liveId).then((data) => {
    console.log('获取到的直播信息:', data)
    startHlsStream(data.playStreamPath)
    isRadio.value = data.isRadio
    coverImage.value = Tools.sourceUrl(data.coverPath)
    realName.value = data.user.userName
    userAvatar.value = Tools.sourceUrl(data.user.userAvatar)
  }).catch((error: any) => {
    console.error(error)
    ElMessage.error('获取直播信息失败')
    loading.value = false
  })
}

// 定时更新直播onlineNum
const onlineNum = ref(0)
const onlineNumTimer = ref()

// 启动定时器
function startOnlineNumTimer() {
  onlineNumTimer.value = setInterval(() => {
    updateOnlineNum()
  }, 15000)
}

// 视频旋转控制
function rotateLeft() {
  rotationAngle.value = (rotationAngle.value - 90) % 360
}

function rotateRight() {
  rotationAngle.value = (rotationAngle.value + 90) % 360
}

function resetRotation() {
  rotationAngle.value = 0
}

// 获取视频尺寸
function updateVideoDimensions() {
  if (nativeVideo.value) {
    videoWidth.value = nativeVideo.value.videoWidth || 0
    videoHeight.value = nativeVideo.value.videoHeight || 0
    videoWH.value = videoWidth.value / videoHeight.value
    console.log('[updateVideoDimensions] 获取到视频尺寸: videoWidth =', videoWidth.value, ', videoHeight =', videoHeight.value)
  }
  else {
    console.log('[updateVideoDimensions] nativeVideo.value 为空')
  }
}

// 停止定时器
function stopOnlineNumTimer() {
  if (onlineNumTimer.value) {
    clearInterval(onlineNumTimer.value)
    onlineNumTimer.value = null
  }
}

function updateOnlineNum() {
  Apis.instance().live(props.liveId).then((data) => {
    console.log('获取到的直播在线人数:', data.onlineNum)
    onlineNum.value = data.onlineNum
  }).catch((error: any) => {
    console.error(error)
  })
}

startOnlineNumTimer()

// 启动 HLS 流
function startHlsStream(rtmpUrl: string) {
  window.mainAPI.convertToHls(rtmpUrl, props.liveId).then((result) => {
    console.log('转换后的 HLS 流地址:', result)
    playStreamPath.value = result.url
    streamId.value = result.liveId
  }).catch((error) => {
    console.error('转换直播流失败:', error)
    ElMessage.error('转换直播流失败')
    loading.value = false
  })
}

// 处理流错误和重试
function handleStreamError() {
  // 如果是手动卸载，不进行重试
  if (isManuallyUnmounted.value) {
    console.log('[LivePlayer.vue] 组件手动卸载，不进行重试')
    return
  }

  if (retryCount.value < maxRetries) {
    retryCount.value++
    console.log(`[LivePlayer.vue] 直播流中断，正在进行第 ${retryCount.value} 次重试`)
    loading.value = true
    setTimeout(() => {
      getOne()
    }, 2000)
  }
  else {
    console.log('[LivePlayer.vue] 重试次数已达上限，停止播放')
    loading.value = false
    ElMessage.warning('直播已结束')
    // 清理资源
    if (streamId.value) {
      window.mainAPI.stopHlsConvert(streamId.value).catch((err) => {
        console.error('停止转码失败:', err)
      })
    }
  }
}

// 添加阻止休眠
const powerSaveBlockerId = ref<number | null>(null)

// ResizeObserver 用于监听容器尺寸变化
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  powerSaveBlockerId.value = await window.mainAPI.preventSleep()

  // 初始化容器尺寸
  if (videoBoxRef.value) {
    boxDimensions.value = {
      width: videoBoxRef.value.clientWidth,
      height: videoBoxRef.value.clientHeight,
    }
  }

  // 监听容器尺寸变化
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      boxDimensions.value = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
    }
  })

  if (videoBoxRef.value) {
    resizeObserver.observe(videoBoxRef.value)
  }
})

onMounted(() => {
  console.log('[LivePlayer.vue] onMounted', props)
  getOne()
  watch(
    () => playStreamPath.value,
    (newPath) => {
      if (nativeVideo.value && newPath) {
        if (Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource(newPath)
          hls.attachMedia(nativeVideo.value)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            loading.value = false
            // 获取视频尺寸用于计算缩放
            setTimeout(() => {
              updateVideoDimensions()
            }, 100)
          })

          // 监听视频尺寸变化
          hls.on(Hls.Events.FRAG_CHANGED, () => {
            setTimeout(() => {
              updateVideoDimensions()
            }, 100)
          })

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (isManuallyUnmounted.value) {
              hls.destroy()
              console.log('[LivePlayer.vue] 组件手动卸载，不进行重试')
              return
            }
            console.error('[LivePlayer.vue] HLS 错误:', data)
            if (data.fatal) {
              loading.value = false
              handleStreamError()
            }
            if (data.type === 'networkError') {
              loading.value = true
              console.log('[LivePlayer.vue] 网络错误，正在重试')
              handleStreamError()
            }
          })
        }
        else if (nativeVideo.value.canPlayType('application/vnd.apple.mpegurl')) {
          nativeVideo.value.src = newPath
          nativeVideo.value.oncanplay = () => {
            loading.value = false
            // 获取视频尺寸用于计算缩放
            setTimeout(() => {
              updateVideoDimensions()
            }, 100)
          }
          nativeVideo.value.onerror = () => {
            loading.value = false
            handleStreamError()
          }
        }
      }
    },
    { immediate: true },
  )
})

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

// 调用Electron主进程暴露的record方法
function record() {
  checkDownloadDirectory()
  Apis.instance().live(props.liveId).then(async (content) => {
    const date = Tools.dateFormat(Number.parseInt(String(props.startTime)), 'yyyyMMddhhmm')
    const filename = `${realName.value} ${date}.flv`
    const recordTask: RecordTask = new RecordTask(content.playStreamPath, filename, content.liveId)
    EventBus.emit('change-selected-menu', Constants.Menu.DOWNLOADS)
    router.push('/downloads')
    setTimeout(() => {
      // console.log('[LivePlayer.vue] 调用 record 参数:', recordTask)
      recordTask.init()
      EventBus.emit('record-task', recordTask)
    })
  }).catch((error) => {
    console.error(error)
  })
}

onUnmounted(() => {
  console.log('[LivePlayer.vue] onUnmounted')
  isManuallyUnmounted.value = true // 设置手动卸载标记
  // 停止 HLS 转码
  if (streamId.value) {
    window.mainAPI.stopHlsConvert(streamId.value).catch((err) => {
      console.error('停止转码失败:', err)
    })
  }
  // 移除阻止休眠
  if (powerSaveBlockerId.value !== null) {
    window.mainAPI.allowSleep(powerSaveBlockerId.value)
  }
  // 清理定时器
  stopOnlineNumTimer()
  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <el-header class="header-box">
    <div style="display: flex; align-items: center; width: 100%;">
      <img :src="userAvatar" alt="Logo" style="width: 32px; height: 32px; margin-right: 12px; border-radius: 50%;">
      <span
        style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 12px;"
        :title="liveTitle"
      >
        {{ liveTitle }}
      </span>
      <el-text type="primary" size="small" style="flex-shrink: 0; margin-right: 12px;">
        (累计在线：{{ onlineNum }})
      </el-text>
      <el-button type="success" style="flex-shrink: 0; margin-right: 8px;" @click="record()">
        录制
      </el-button>
      <el-button-group style="flex-shrink: 0;">
        <el-button title="向左旋转90°" @click="rotateLeft">
          ↺
        </el-button>
        <el-button title="重置旋转" @click="resetRotation">
          <svg t="1770917205717" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2776" width="12" height="12"><path d="M0 0.004h1023.996V1024H0z" fill-opacity="0" p-id="2777" /><path d="M502.698 58.304l-126.5-54.7c-26.5-10.3-56.3 2.2-67.6 28.3s0.1 56.4 25.7 68.6C157.3 174.403 46.9 352.901 60 544.301S206.6 897.6 391.999 946.7c4.5 1.1 9.2 1.7 13.8 1.8 26.5 0 48.8-19.7 52.3-45.9s-13.1-51-38.6-57.9c-144-38.3-246.7-165.399-254-314.298s82.7-285.3 222.3-337.399l-8.4 19.5c-5.5 12.9-5.7 27.4-0.4 40.4 5.2 13 15.4 23.3 28.3 28.8 6.5 2.9 13.5 4.3 20.6 4.4 20.9 0.2 40-12 48.6-31.1l53.699-127.4c11.3-26.9-0.9-57.7-27.5-69.3z m460.298 451.498c5.4-202.3-125.2-383.199-318.998-441.698-18.3-6.3-38.6-2-52.8 11s-20.2 32.9-15.6 51.7 19.2 33.5 38 38.3c133.6 39.899 229.799 156.699 243.199 295.498s-58.6 271.8-182.2 336.499c14-25.5 4.6-57.5-20.8-71.5-25.5-14-57.5-4.6-71.5 20.8l-71.899 117.2c-7.5 11.9-9.9 26.3-6.6 40 3.3 13.7 11.9 25.5 23.9 32.8l117.1 72.799c16.1 12.1 37.6 14.1 55.6 5s29.2-27.6 29-47.7c-0.2-20.1-11.8-38.4-30-47.1l-16-10c165.099-66.9 274.898-225.399 279.598-403.598z" fill="#4C4C4C" p-id="2778" /></svg>
        </el-button>
        <el-button title="向右旋转90°" @click="rotateRight">
          ↻
        </el-button>
      </el-button-group>
    </div>
  </el-header>
  <div ref="videoBoxRef" class="video-box" :class="{ 'vertical-rotation': isVerticalRotation }">
    <div class="video-wrapper" :style="videoWrapperStyle">
      <video
        ref="nativeVideo"
        controls
        autoplay
        class="video-player"
        :style="videoStyle"
        :poster="coverImage"
      />
    </div>
    <div v-if="loading" class="loading-container">
      <el-icon color="#FFFFFF" class="is-loading" size="24px">
        <Loading />
      </el-icon>
      <span class="loading-text">正在加载直播...</span>
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
  background: #000;
  position: relative;
  overflow: hidden;
  /* 确保容器有足够的空间 */
  min-height: 200px;
}

/* 视频包装器 - 用于旋转 */
.video-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.3s ease;
  transform-origin: center center;
  width: 100%;
  height: 100%;
}

/* 垂直旋转时的样式 - 自适应窗口大小 */
.video-box.vertical-rotation {
  overflow: hidden;
}

.video-box.vertical-rotation .video-wrapper {
  /* 旋转90/270度时，交换宽高并缩放以适应容器 */
  width: 100%;
  height: 100%;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.loading-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.loading-text {
  color: #fff;
  font-size: 14px;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
