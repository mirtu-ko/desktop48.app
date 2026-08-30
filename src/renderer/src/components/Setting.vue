<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref } from 'vue'
import Apis from '../assets/js/apis'
import Constants from '../assets/js/constants'
import HiddenMembers from '../components/HiddenMembers.vue'

const isUpdating = ref(false)

// 更新成员信息
function updateInfo() {
  isUpdating.value = true
  Apis.instance().syncInfo().then(() => {
    ElMessage({
      message: '更新完毕',
      type: 'success',
    })
    isUpdating.value = false
  }).catch((error: any) => {
    console.error(error)
    isUpdating.value = false
  })
}

// 下载目录 / ffmpeg目录 / User-Agent
const downloadDirectory = ref('')
const ffmpegDirectory = ref('')
const userAgent = ref('')
onMounted(async () => {
  downloadDirectory.value = await window.mainAPI.getConfig('downloadDirectory')
  ffmpegDirectory.value = await window.mainAPI.getConfig('ffmpegDirectory', '')
  userAgent.value = await window.mainAPI.getConfig('userAgent', Constants.DEFAULT_USER_AGENT)
})

async function setDownloadDirectory() {
  const dir = await window.mainAPI.selectDirectory()
  if (dir) {
    downloadDirectory.value = dir
    await window.mainAPI.setConfig('downloadDirectory', downloadDirectory.value)
    ElMessage({
      message: '设置成功',
      type: 'success',
    })
  }
}

async function openDownloadDirectory() {
  window.mainAPI.openPath(downloadDirectory.value)
}

async function setFfmpegDirectory() {
  const dir = await window.mainAPI.selectDirectory()
  if (dir) {
    try { // 校验 ffmpeg/ffplay 可执行文件存在
      await window.mainAPI.checkFfmpegBinaries(dir)
      ffmpegDirectory.value = dir
      await window.mainAPI.setConfig('ffmpegDirectory', ffmpegDirectory.value)
      ElMessage({
        message: '设置成功',
        type: 'success',
      })
    }
    catch (e) {
      console.error(e)
      confirmFfmpegDir()
    }
  }
}

function confirmFfmpegDir() {
  ElMessageBox.confirm('选择的目录下没有ffmpeg或ffplay', {
    confirmButtonText: '重新选择',
    cancelButtonText: '取消',
  }).then(() => {
    setFfmpegDirectory()
  }).catch(() => {
    // 用户取消操作
  })
}

async function openFfmpegDirectory() {
  window.mainAPI.openPath(ffmpegDirectory.value)
}

async function setUserAgent() {
  await window.mainAPI.setConfig('userAgent', userAgent.value)
  ElMessage({
    message: '设置成功',
    type: 'success',
  })
}
</script>

<template>
  <el-scrollbar
    style="height: 100%"
    wrap-class="scrollbar-wrapper"
  >
    <div class="setting-root">
      <el-divider content-position="left">
        更新成员信息
      </el-divider>

      <el-card style="text-align: left;" shadow="hover">
        <el-button type="primary" :loading="isUpdating" @click="updateInfo">
          更新成员信息
        </el-button>
      </el-card>

      <el-divider content-position="left">
        User-Agent设置
      </el-divider>

      <el-card class="setting-card" shadow="hover">
        <div class="setting-row setting-row--wide">
          <el-input v-model="userAgent" type="text" placeholder="设置User-Agent" />
          <el-button type="primary" @click="setUserAgent">
            设置
          </el-button>
        </div>
      </el-card>

      <el-divider content-position="left">
        默认下载目录
      </el-divider>

      <el-card class="setting-card" shadow="hover">
        <div class="setting-row setting-row--narrow">
          <el-input v-model="downloadDirectory" type="text" placeholder="下载目录" readonly @click="setDownloadDirectory" />
          <el-button type="primary" @click="setDownloadDirectory">
            选择
          </el-button>
          <el-button type="success" @click="openDownloadDirectory">
            打开目录
          </el-button>
        </div>
      </el-card>

      <el-divider content-position="left">
        ffmpeg目录
      </el-divider>

      <el-card class="setting-card" shadow="hover">
        <div class="setting-row setting-row--narrow">
          <el-input v-model="ffmpegDirectory" type="text" placeholder="ffmpeg目录" readonly @click="setFfmpegDirectory" />
          <el-button type="primary" @click="setFfmpegDirectory">
            选择
          </el-button>
          <el-button type="success" @click="openFfmpegDirectory">
            打开目录
          </el-button>
        </div>
      </el-card>

      <el-divider content-position="left">
        屏蔽成员直播|回放
      </el-divider>

      <el-card class="setting-card" shadow="hover">
        <HiddenMembers />
      </el-card>
    </div>
  </el-scrollbar>
</template>

<style scoped>
.scrollbar-wrapper,
.setting-root {
  height: 100%;
}

.setting-card {
  margin-top: 16px;
}

.setting-row {
  display: flex;
  gap: 8px;
}

.setting-row--wide {
  width: 720px;
}

.setting-row--narrow {
  width: 640px;
}
</style>
