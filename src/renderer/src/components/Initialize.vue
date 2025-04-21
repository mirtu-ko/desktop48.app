<script setup lang="ts">
import { onMounted, ref } from 'vue'

const emit = defineEmits(['onInitialized'])

// 初始化
const initText = ref('正在初始化')
const isIniting = ref(false)
const percent = ref(0)
const downloading = ref(false)

/**
 * 初始化
 */
onMounted(async () => {
  init()
})

async function init() {
  if (!window.mainAPI || typeof window.mainAPI.getConfig !== 'function') {
    initText.value = 'Electron API 未注入，无法获取平台信息'
    console.error('window.mainAPI 未定义或 getConfig 方法不存在')
    return
  }
  isIniting.value = true
  initText.value = '正在初始化'
  // 再次检查本地是否已有ffmpeg目录
  const ffmpegDir = await window.mainAPI.getConfig('ffmpegDirectory', '')
  if (ffmpegDir) {
    // 打印当前的系统平台
    const platform = window.mainAPI.getPlatform()
    console.log('[Initialize.vue]当前系统平台：', platform)
    console.log('已保存ffmpeg目录')
    emit('onInitialized')
    return
  }
  // 只允许手动选择 ffmpeg 目录
  initText.value = '请选择 ffmpeg 目录'
}

/**
 * 选择ffmpeg目录
 */
async function selectFfmpegDir() {
  const dir = await window.mainAPI.selectDirectory()
  if (dir) {
    try {
      // 可选：校验 ffmpeg/ffplay 可执行文件存在
      await window.mainAPI.setConfig('ffmpegDirectory', dir)
      initText.value = '保存目录成功'
      console.log('保存ffmpeg目录成功')
      emit('onInitialized')
    }
    catch (e) {
      console.error(e)
      initText.value = '保存目录失败，请重试'
    }
  }
}
</script>

<template>
  <el-container>
    <el-main style="display: flex;flex-direction: column;align-items:center;justify-content:center;height: 600px;">
      <div>
        <i class="el-icon-loading" />
        <span style="margin-left: 8px;">{{ initText }}</span>
      </div>
      <el-progress v-if="downloading" style="margin-top: 16px;" type="circle" :percentage="percent" />

      <el-button style="margin-top: 32px;" type="primary" @click="selectFfmpegDir">
        手动选择ffmpeg目录
      </el-button>
    </el-main>
  </el-container>
</template>

<style scoped></style>
