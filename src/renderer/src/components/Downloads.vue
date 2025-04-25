<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import DownloadTask from '../assets/js/download-task'
import EventBus from '../assets/js/event-bus'
import RecordTask from '../assets/js/record-task'

const downloadTasks = ref<DownloadTask[]>([])
const recordTasks = ref<RecordTask[]>([])

onMounted(() => {
  // 绑定下载事件
  EventBus.on('download-task', (taskData: any) => {
    console.log('[Downloads.vue]taskData', taskData)
    const downloadTask = new DownloadTask(taskData._url, taskData._filename, taskData._liveId)
    downloadTask.progress = taskData.progress || 0
    const exists = downloadTasks.value.some((item) => {
      console.log('[Downloads.vue]task exists', item.getLiveId(), downloadTask.getLiveId())
      return item.getLiveId() === downloadTask.getLiveId()
    })
    if (exists) {
      ElMessage({
        message: '该回放已在下载列表',
        type: 'warning',
      })
      return
    }
    downloadTasks.value.push(downloadTask)
    downloadTask.setOnProgress((percent: number) => {
      downloadTask.progress = percent
    })
    downloadTask.setOnEnd(() => {
      downloadTask.progress = 100
      // 触发响应式刷新
      downloadTasks.value = [...downloadTasks.value]
    })
    downloadTask.start(() => {
      ElMessage({
        message: '下载开始',
        type: 'info',
      })
    })
  })
  // 新增：监听 record-task 事件
  EventBus.on('record-task', (taskData: any) => {
    console.log('[Downloads.vue]record-task', taskData)
    // 始终用 new RecordTask，只取参数，避免原型链问题
    const recordTask = new RecordTask(taskData._url, taskData._filename, taskData._liveId)
    recordTask.progress = taskData.progress || 0
    const exists = recordTasks.value.some(item => item.getLiveId() === recordTask.getLiveId())
    if (exists) {
      ElMessage({
        message: '该直播已在录制列表',
        type: 'warning',
      })
      return
    }
    recordTasks.value.push(recordTask)
    recordTask.setOnProgress((progress: number) => {
      recordTask.progress = progress
    })
    recordTask.setOnEnd(() => {
      // 触发响应式刷新
      recordTasks.value = [...recordTasks.value]
    })
    recordTask.start(() => {
      ElMessage({
        message: '录制开始',
        type: 'info',
      })
    })
  })
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

    <el-card
      v-for="downloadTask in downloadTasks" v-else :key="downloadTask.getLiveId()" style="margin-bottom: 8px;"
      shadow="hover"
    >
      <div class="task-info">
        <div>
          <i v-if="downloadTask.isDownloading()" class="el-icon-loading" style="color: #409EFF;" />
          <i v-if="downloadTask.isFinish()" class="el-icon-check" style="color: #67C23A;" />
          <span style="margin-left: 8px;">{{ downloadTask.getFilePath() }}</span>
        </div>
        <div>
          <el-button v-if="downloadTask.isDownloading()" type="danger" size="small" @click="downloadTask.stop()">
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

      <div class="task-progress">
        <el-progress text-inside :stroke-width="18" :percentage="downloadTask.progress" />
      </div>
    </el-card>

    <el-divider content-position="left">
      录制任务
    </el-divider>

    <el-card v-if="recordTasks.length === 0" shadow="hover">
      <span>未有录制任务</span>
    </el-card>

    <el-card
      v-for="recordTask in recordTasks" v-else :key="recordTask.getLiveId()" style="margin-bottom: 8px;"
      shadow="hover"
    >
      <div class="task-info">
        <div>
          <i v-if="recordTask.isRecording()" class="el-icon-loading" style="color: #409EFF;">
            <span style="margin-left: 8px;">{{ `${recordTask.getFilename()}|${recordTask.progress}` }}</span>
          </i>
          <i v-if="recordTask.isFinish()" class="el-icon-check" style="color: #67C23A;">
            <span style="margin-left: 8px;">{{ recordTask.getFilePath() }}</span>
          </i>
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

.task-progress {
  margin-top: 8px;
  text-align: left;
}

.download-button {
  cursor: pointer;
  font-size: 28px;
}
</style>
