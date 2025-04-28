<script setup lang="ts">
import { Check, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import DownloadTask from '../assets/js/download-task'
import EventBus from '../assets/js/event-bus'
import RecordTask from '../assets/js/record-task'

const downloadTasks = ref<DownloadTask[]>([])
const recordTasks = ref<RecordTask[]>([])

onMounted(() => {
  // 绑定下载事件
  EventBus.on('download-task', (taskData: any) => {
    console.log('[Downloads.vue]taskData', taskData)
    // 始终用 new DownloadTask，只取参数，避免原型链问题，并用 reactive 代理
    const rawTask = new DownloadTask(taskData._url, taskData._filename, taskData._liveId)
    const downloadTask = reactive(rawTask)
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
    downloadTask.start(() => {
      ElMessage({
        message: '下载开始',
        type: 'info',
      })
    })
  })
  // 监听 record-task 事件
  EventBus.on('record-task', (taskData: any) => {
    console.log('[Downloads.vue]record-task', taskData)
    // 始终用 new RecordTask，只取参数，避免原型链问题，并用 reactive 代理
    const rawTask = new RecordTask(taskData._url, taskData._filename, taskData._liveId)
    const recordTask = reactive(rawTask)
    const exists = recordTasks.value.some(item => item.getLiveId() === recordTask.getLiveId())
    if (exists) {
      ElMessage({
        message: '该直播已在录制列表',
        type: 'warning',
      })
      // 更新任务，如果任务状态为结束，重新开始
      const task = recordTasks.value.find(item => item.getLiveId() === recordTask.getLiveId())
      if (task && task.isFinish()) {
        task.start(() => {
          ElMessage({
            message: '录制已重新开始，原任务将被覆盖',
            type: 'info',
          })
        })
      }
      return
    }
    recordTasks.value.push(recordTask)
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
        <div style="display: flex; align-items: center;">
          <el-icon v-if="downloadTask.isDownloading()" color="#409EFF" class="is-loading">
            <Loading />
          </el-icon>
          <el-icon v-if="downloadTask.isFinish()" color="#67C23A">
            <Check />
          </el-icon>
          <span style="margin-left: 8px;">{{ downloadTask.getFilePath() }}</span>
        </div>
        <div>
          <el-button v-if="downloadTask.isDownloading()" type="danger" size="small" @click="downloadTask.stop(); downloadTasks.splice(downloadTasks.indexOf(downloadTask), 1)">
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

    <el-divider content-position="left">
      录制任务
    </el-divider>

    <el-card v-if="recordTasks.length === 0" shadow="hover">
      <span>未有录制任务</span>
    </el-card>

    <el-card
      v-for="recordTask in recordTasks" :key="recordTask.getLiveId()" style="margin-bottom: 8px;"
      shadow="hover"
    >
      <div class="task-info">
        <div style="display: flex; align-items: center;">
          <el-icon v-if="recordTask.isRecording()" color="#409EFF" class="is-loading">
            <Loading />
          </el-icon>
          <el-icon v-if="recordTask.isFinish()" color="#67C23A">
            <Check />
          </el-icon>
          <span style="margin-left: 8px;">{{ recordTask.getFilePath() }}</span>
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
