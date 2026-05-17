<script setup lang="ts">
import type { DownloadTaskPayload, RecordTaskPayload } from '../assets/js/task-payload'
import { Check, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import DownloadTask from '../assets/js/download-task'
import EventBus from '../assets/js/event-bus'
import RecordTask from '../assets/js/record-task'

const downloadTasks = ref<DownloadTask[]>([])
const recordTasks = ref<RecordTask[]>([])

interface DownloadTaskRow {
  getLiveId: () => string
  stop: () => void
}

function findDownloadTaskByLiveId(liveId: string) {
  return downloadTasks.value.find(item => item.getLiveId() === liveId)
}

function findRecordTaskByLiveId(liveId: string) {
  return recordTasks.value.find(item => item.getLiveId() === liveId)
}

function removeDownloadTask(task: DownloadTaskRow) {
  const index = downloadTasks.value.findIndex(item => item.getLiveId() === task.getLiveId())
  if (index !== -1) {
    downloadTasks.value.splice(index, 1)
  }
}

function stopDownloadTask(task: DownloadTaskRow) {
  task.stop()
  removeDownloadTask(task)
}

function handleDownloadTask(taskData: DownloadTaskPayload) {
  console.log('[Downloads.vue]taskData', taskData)
  const liveId = taskData.liveId
  const exists = findDownloadTaskByLiveId(liveId)
  if (exists) {
    ElMessage({
      message: '该回放已在下载列表',
      type: 'warning',
    })
    return
  }

  const rawTask = new DownloadTask(taskData.url, taskData.filename, liveId)
  const downloadTask = reactive(rawTask)
  downloadTasks.value.push(downloadTask)
  downloadTask.start(() => {
    ElMessage({
      message: '下载开始',
      type: 'info',
    })
  })
}

function handleRecordTask(taskData: RecordTaskPayload) {
  console.log('[Downloads.vue]record-task', taskData)
  const liveId = taskData.liveId
  const exists = findRecordTaskByLiveId(liveId)
  if (exists) {
    ElMessage({
      message: '该直播已在录制列表',
      type: 'warning',
    })
    // 任务已结束时，按最新参数重启，确保覆盖行为与提示一致
    if (exists.isFinish()) {
      exists.setUrl(taskData.url)
      exists.setFilename(taskData.filename)
      exists.start(() => {
        ElMessage({
          message: '录制已重新开始，原任务将被覆盖',
          type: 'info',
        })
      })
    }
    return
  }

  const rawTask = new RecordTask(taskData.url, taskData.filename, liveId)
  const recordTask = reactive(rawTask)
  recordTasks.value.push(recordTask)
  recordTask.start(() => {
    ElMessage({
      message: '录制开始',
      type: 'info',
    })
  })
}

onMounted(() => {
  EventBus.on('download-task', handleDownloadTask)
  EventBus.on('record-task', handleRecordTask)
})

onUnmounted(() => {
  EventBus.off('download-task', handleDownloadTask)
  EventBus.off('record-task', handleRecordTask)
})
</script>

<template>
  <div>
    <el-divider content-position="left">
      下载任务
    </el-divider>

    <el-card v-if="downloadTasks.length === 0" shadow="hover">
      <span>未有下载任务</span>
    </el-card>

    <template v-else>
      <el-card
        v-for="downloadTask in downloadTasks" :key="downloadTask.getLiveId()" class="task-card"
        shadow="hover"
      >
        <div class="task-info">
          <div class="task-main">
            <el-icon v-if="downloadTask.isDownloading()" color="#409EFF" class="is-loading">
              <Loading />
            </el-icon>
            <el-icon v-if="downloadTask.isFinish()" color="#67C23A">
              <Check />
            </el-icon>
            <span class="task-path">{{ downloadTask.getFilePath() }}</span>
          </div>
          <div>
            <el-button v-if="downloadTask.isDownloading()" type="danger" size="small" @click="stopDownloadTask(downloadTask)">
              结束
            </el-button>
            <el-button
              v-if="downloadTask.isFinish()" type="success" size="small"
              @click="downloadTask.openSaveDirectory()"
            >
              打开文件夹
            </el-button>
          </div>
        </div>
      </el-card>
    </template>

    <el-divider content-position="left">
      录制任务
    </el-divider>

    <el-card v-if="recordTasks.length === 0" shadow="hover">
      <span>未有录制任务</span>
    </el-card>

    <el-card
      v-for="recordTask in recordTasks" :key="recordTask.getLiveId()" class="task-card"
      shadow="hover"
    >
      <div class="task-info">
        <div class="task-main">
          <el-icon v-if="recordTask.isRecording()" color="#409EFF" class="is-loading">
            <Loading />
          </el-icon>
          <el-icon v-if="recordTask.isFinish()" color="#67C23A">
            <Check />
          </el-icon>
          <span class="task-path">{{ recordTask.getFilePath() }}</span>
        </div>
        <div>
          <el-button v-if="recordTask.isRecording()" type="danger" size="small" @click="recordTask.stop()">
            结束
          </el-button>
          <el-button v-if="recordTask.isFinish()" type="success" size="small" @click="recordTask.openSaveDirectory()">
            打开文件夹
          </el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.task-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
}

.task-main {
  display: flex;
  align-items: center;
}

.task-path {
  margin-left: 8px;
}

.task-card {
  margin-bottom: 8px;
}

.task-progress {
  margin-top: 8px;
  text-align: left;
}

.download-button {
  cursor: pointer;
  font-size: 28px;
}
</style>
