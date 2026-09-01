<script setup lang="ts">
import { Connection, Cpu, Folder, Hide } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref } from 'vue'
import Constants from '../assets/js/constants'
import BlockedMembers from './BlockedMembers.vue'

// 下载目录 / ffmpeg目录 / User-Agent
const downloadDirectory = ref('')
const ffmpegDirectory = ref('')
const userAgent = ref('')
// 屏蔽成员数量（由 BlockedMembers 组件回报）
const blockedCount = ref(0)
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
      <!-- User-Agent -->
      <section class="setting-card glass-card">
        <div class="setting-row">
          <span class="row-icon" style="--row-color: #6d5ae0">
            <el-icon><Connection /></el-icon>
          </span>
          <div class="row-text">
            <div class="row-title">
              User-Agent
            </div>
            <div class="row-desc">
              访问直播 / 回放接口时使用的浏览器标识
            </div>
          </div>
          <el-input
            v-model="userAgent"
            class="row-control"
            placeholder="设置 User-Agent"
          />
          <el-button
            type="primary"
            class="row-action"
            @click="setUserAgent"
          >
            保存
          </el-button>
        </div>
      </section>

      <!-- 默认下载目录 -->
      <section class="setting-card glass-card">
        <div class="setting-row">
          <span class="row-icon" style="--row-color: #10b981">
            <el-icon><Folder /></el-icon>
          </span>
          <div class="row-text">
            <div class="row-title">
              默认下载目录
            </div>
            <div class="row-desc">
              回放与录制文件的保存位置
            </div>
          </div>
          <el-input
            v-model="downloadDirectory"
            class="row-control"
            readonly
            placeholder="点击输入框选择目录"
            @click="setDownloadDirectory"
          />
          <div class="row-actions">
            <el-button
              type="primary"
              @click="setDownloadDirectory"
            >
              选择
            </el-button>
            <el-button @click="openDownloadDirectory">
              打开目录
            </el-button>
          </div>
        </div>
      </section>

      <!-- ffmpeg 目录 -->
      <section class="setting-card glass-card">
        <div class="setting-row">
          <span class="row-icon" style="--row-color: #f59e0b">
            <el-icon><Cpu /></el-icon>
          </span>
          <div class="row-text">
            <div class="row-title">
              FFmpeg 目录
            </div>
            <div class="row-desc">
              下载 / 录制依赖的 ffmpeg 程序文件目录
            </div>
          </div>
          <el-input
            v-model="ffmpegDirectory"
            class="row-control"
            readonly
            placeholder="点击输入框选择目录"
            @click="setFfmpegDirectory"
          />
          <div class="row-actions">
            <el-button
              type="primary"
              @click="setFfmpegDirectory"
            >
              选择
            </el-button>
            <el-button @click="openFfmpegDirectory">
              打开目录
            </el-button>
          </div>
        </div>
      </section>

      <!-- 屏蔽成员 -->
      <section class="setting-card glass-card">
        <div class="setting-row">
          <span class="row-icon" style="--row-color: #ff5e7e">
            <el-icon><Hide /></el-icon>
          </span>
          <div class="row-text">
            <div class="row-title">
              屏蔽成员
            </div>
            <div class="row-desc">
              已屏蔽 {{ blockedCount }} 名成员，其直播与回放将不再展示
            </div>
          </div>
        </div>
        <div class="row-body">
          <BlockedMembers @change="blockedCount = $event" />
        </div>
      </section>
    </div>
  </el-scrollbar>
</template>

<style scoped lang="scss">
.scrollbar-wrapper {
  height: 100%;
}

.setting-root {
  max-width: 880px;
  margin: 0 auto;
  padding: 20px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 设置卡片：磨砂玻璃基底见全局 .glass-card */
.setting-card {
  padding: 18px 20px;
  border-radius: var(--radius-lg);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

/* 渐变主题图标磁贴，与底部 Dock 的视觉语言一致 */
.row-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, color-mix(in srgb, var(--row-color) 72%, #fff), var(--row-color));
  color: #fff;
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--row-color) 65%, transparent);

  .el-icon {
    font-size: 21px;
  }
}

.row-text {
  flex-shrink: 0;
  width: 190px;

  .row-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .row-desc {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--el-text-color-secondary);
  }
}

.row-control {
  flex: 1;
  min-width: 200px;
  cursor: pointer;
}

.row-actions {
  flex-shrink: 0;
  display: flex;
}

/* 屏蔽成员等复杂控件：与标题行之间用虚线分隔 */
.row-body {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

/* 品牌主按钮统一为渐变风格 */
:deep(.el-button--primary) {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light));
  border: none;
  box-shadow: var(--shadow-glow);

  &:hover {
    background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-secondary));
  }
}
</style>
