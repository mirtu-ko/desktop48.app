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
    class="scrollbar-wrapper"
    wrap-class="scrollbar-wrapper"
  >
    <div class="setting-root">
      <el-divider content-position="left" class="section-divider">
        更新成员数据库
      </el-divider>

      <el-card class="glass-card" shadow="hover">
        <el-button type="primary" :loading="isUpdating" @click="updateInfo">
          更新成员数据库
        </el-button>
      </el-card>

      <el-divider content-position="left" class="section-divider">
        User-Agent设置
      </el-divider>

      <el-card class="glass-card" shadow="hover">
        <div class="setting-row">
          <el-input v-model="userAgent" type="text" placeholder="设置User-Agent" />
          <el-button type="primary" @click="setUserAgent">
            设置
          </el-button>
        </div>
      </el-card>

      <el-divider content-position="left" class="section-divider">
        默认下载目录
      </el-divider>

      <el-card class="glass-card" shadow="hover">
        <div class="setting-row">
          <el-input v-model="downloadDirectory" type="text" placeholder="下载目录" readonly @click="setDownloadDirectory" />
          <el-button type="primary" @click="setDownloadDirectory">
            选择
          </el-button>
          <el-button type="success" @click="openDownloadDirectory">
            打开目录
          </el-button>
        </div>
      </el-card>

      <el-divider content-position="left" class="section-divider">
        ffmpeg目录
      </el-divider>

      <el-card class="glass-card" shadow="hover">
        <div class="setting-row">
          <el-input v-model="ffmpegDirectory" type="text" placeholder="ffmpeg目录" readonly @click="setFfmpegDirectory" />
          <el-button type="primary" @click="setFfmpegDirectory">
            选择
          </el-button>
          <el-button type="success" @click="openFfmpegDirectory">
            打开目录
          </el-button>
        </div>
      </el-card>

      <el-divider content-position="left" class="section-divider">
        屏蔽成员直播|回放
      </el-divider>

      <el-card class="glass-card" shadow="hover">
        <HiddenMembers />
      </el-card>
    </div>
  </el-scrollbar>
</template>

<style scoped lang="scss">
.scrollbar-wrapper {
  height: 100%;
}

.setting-root {
  padding: 16px 20px 28px;
}

/* 分区标题与下方卡片统一间距 */
:deep(.section-divider) {
  --el-divider-margin: 4px 0 16px;
}

/* 全新风格卡片：磨砂玻璃 + 柔和边框 + 轻投影（基础样式见全局 .glass-card） */
.glass-card {
  :deep(.el-card__body) {
    padding: 18px 20px;
  }
}

/* 品牌主按钮统一为渐变风格 */
:deep(.glass-card .el-button--primary) {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light));
  border: none;
  box-shadow: 0 6px 16px -4px rgba(108, 92, 231, 0.5);

  &:hover {
    background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-secondary));
  }
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 640px;

  .el-input {
    flex: 1;
  }

  .el-button {
    flex-shrink: 0;
  }
}
</style>
