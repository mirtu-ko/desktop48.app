<script setup lang="ts">
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Apis from '../assets/js/apis'

const props = defineProps({
  liveTitle: { type: String, required: true },
  liveId: { type: String, required: true },
})

const playStreamPath = ref('')
const nativeVideo = ref<HTMLVideoElement | null>(null)
const streamId = ref('') // 添加 streamId 引用
const loading = ref(true) // 添加 loading 状态

// 获取直播信息
function getOne() {
  loading.value = true // 开始加载时显示
  Apis.instance().live(props.liveId).then((data) => {
    console.log('获取到的直播信息:', data)
    // 这里需要主进程处理将 RTMP 转换为 HLS
    window.mainAPI.convertToHls(data.playStreamPath).then((result) => {
      // 假设返回格式为 { url: string, streamId: string }
      console.log('转换后的 HLS 流地址:', result)
      playStreamPath.value = result.url
      streamId.value = result.streamId // 保存 streamId
    }).catch((error) => {
      console.error('转换直播流失败:', error)
      ElMessage.error('转换直播流失败')
      loading.value = false // 加载失败时隐藏
    })
  }).catch((error: any) => {
    console.error(error)
    ElMessage.error('获取直播信息失败')
    loading.value = false // 加载失败时隐藏
  })
}

// 组件卸载时清理资源
onUnmounted(() => {
  if (streamId.value) {
    window.mainAPI.stopHlsConvert(streamId.value).catch((err) => {
      console.error('停止转码失败:', err)
    })
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

          // 监听 HLS 事件
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            loading.value = false // 视频可以播放时隐藏加载效果
          })

          hls.on(Hls.Events.ERROR, () => {
            loading.value = false // 出错时隐藏加载效果
          })
        }
        else if (nativeVideo.value.canPlayType('application/vnd.apple.mpegurl')) {
          nativeVideo.value.src = newPath
          nativeVideo.value.oncanplay = () => {
            loading.value = false // 视频可以播放时隐藏加载效果
          }
          nativeVideo.value.onerror = () => {
            loading.value = false // 出错时隐藏加载效果
          }
        }
      }
    },
    { immediate: true },
  )
})
</script>

<template>
  <div class="live-player">
    <video
      ref="nativeVideo"
      controls
      autoplay
      class="video-player"
    />
    <div v-if="loading" class="loading-container">
      <el-icon class="loading-icon">
        <Loading />
      </el-icon>
      <span class="loading-text">正在加载直播...</span>
    </div>
  </div>
</template>

<style scoped>
.live-player {
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

.loading-icon {
  font-size: 24px;
  color: #fff;
  animation: rotating 2s linear infinite;
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
