<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Apis from '../assets/js/apis'
import Tools from '../assets/js/tools'

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
})

const playStreamPath = ref('')
const nativeVideo = ref<HTMLVideoElement | null>(null)
const streamId = ref('')
const loading = ref(true)
const retryCount = ref(0)
const maxRetries = 3
const isManuallyUnmounted = ref(false) // 添加手动卸载标记

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
  }).catch((error: any) => {
    console.error(error)
    ElMessage.error('获取直播信息失败')
    loading.value = false
  })
}

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

const powerSaveBlockerId = ref<number | null>(null)
// 添加阻止休眠
onMounted(async () => {
  powerSaveBlockerId.value = await window.mainAPI.preventSleep()
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
})
</script>

<template>
  <div class="video-box">
    <video
      ref="nativeVideo"
      controls
      autoplay
      class="video-player"
      :poster="coverImage"
    />
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
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  position: relative;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: absolute;
  top: 0;
  left: 0;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 1;
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
