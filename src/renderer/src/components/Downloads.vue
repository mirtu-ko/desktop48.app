<script setup lang="ts">
import type { Ref } from 'vue'
import type TaskBase from '../assets/js/task-base'
import type { TaskPayload, TaskSnapshot } from '../assets/js/task-payload'
import { Check, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import DownloadTask from '../assets/js/download-task'
import EventBus from '../assets/js/event-bus'
import RecordTask from '../assets/js/record-task'

type TaskKind = 'download' | 'record'

const downloadTasks = ref([]) as Ref<TaskBase[]>
const recordTasks = ref([]) as Ref<TaskBase[]>

interface TaskKindConfig {
  newTask: (_taskData: TaskPayload) => TaskBase
  list: Ref<TaskBase[]>
  listApi: () => Promise<TaskSnapshot[]>
  removeApi: (_liveId: string) => Promise<void>
  runningMessage: string
  startMessage: string
  restartMessage: string
  logTag: string
}

// 下载/录制两类任务的差异配置：处理骨架完全一致
const taskConfigs: Record<TaskKind, TaskKindConfig> = {
  download: {
    newTask: taskData => new DownloadTask(taskData.url, taskData.filename, taskData.liveId),
    list: downloadTasks,
    listApi: () => window.mainAPI.downloadTaskList(),
    removeApi: liveId => window.mainAPI.downloadTaskRemove(liveId),
    runningMessage: '该回放正在下载',
    startMessage: '下载开始',
    restartMessage: '下载已重新开始，原任务将被覆盖',
    logTag: 'download',
  },
  record: {
    newTask: taskData => new RecordTask(taskData.url, taskData.filename, taskData.liveId),
    list: recordTasks,
    listApi: () => window.mainAPI.recordTaskList(),
    removeApi: liveId => window.mainAPI.recordTaskRemove(liveId),
    runningMessage: '该直播正在录制',
    startMessage: '录制开始',
    restartMessage: '录制已重新开始，原任务将被覆盖',
    logTag: 'record',
  },
}

async function startTask(task: TaskBase, config: TaskKindConfig, message: string) {
  // reactive() 的类型会剥掉类的私有字段，运行时返回的是同一代理，断言回 TaskBase
  const reactiveTask = reactive(task) as TaskBase
  try {
    await reactiveTask.start(() => {
      ElMessage({ message, type: 'info' })
    })
    // 重启路径下任务已在列表中，避免重复 push 导致卡片重复
    if (!config.list.value.includes(reactiveTask))
      config.list.value.push(reactiveTask)
  }
  catch (error) {
    console.error(`[Downloads.vue] ${config.logTag} task start failed`, error)
    ElMessage({ message: String(error), type: 'error' })
  }
}

async function handleTask(taskData: TaskPayload, kind: TaskKind) {
  const config = taskConfigs[kind]
  const exists = config.list.value.find(item => item.getLiveId() === taskData.liveId)
  if (exists) {
    if (exists.isRunning()) {
      ElMessage({ message: config.runningMessage, type: 'warning' })
      return
    }
    // 任务已结束：按最新参数重启（覆盖原文件）
    exists.setUrl(taskData.url)
    exists.setFilename(taskData.filename)
    await startTask(exists, config, config.restartMessage)
    return
  }
  await startTask(config.newTask(taskData), config, config.startMessage)
}

async function removeTask(task: TaskBase, kind: TaskKind) {
  const config = taskConfigs[kind]
  const index = config.list.value.findIndex(item => item.getLiveId() === task.getLiveId())
  if (index !== -1)
    config.list.value.splice(index, 1)
  // 同步删除主进程快照，否则刷新后该任务会再次出现
  await config.removeApi(task.getLiveId())
}

// 页面加载后从主进程恢复任务列表（刷新不会清空主进程实际运行的 ffmpeg，任务状态仍以主进程为准）
async function restoreTasks(kind: TaskKind) {
  const config = taskConfigs[kind]
  const snapshots = await config.listApi()
  for (const snapshot of snapshots) {
    // 已有同 liveId 任务则跳过，避免重复卡片
    if (config.list.value?.some(item => item.getLiveId() === snapshot.liveId))
      continue
    const task = config.newTask({ url: snapshot.url, filename: snapshot.filename, liveId: snapshot.liveId })
    task.restore(snapshot)
    const reactiveTask = reactive(task) as TaskBase
    config.list.value?.push(reactiveTask)
  }
}

onMounted(() => {
  restoreTasks('download')
  restoreTasks('record')
})

const taskGroups = computed(() => [
  { kind: 'download' as TaskKind, title: '回放下载任务', emptyText: '无下载任务', tasks: downloadTasks.value },
  { kind: 'record' as TaskKind, title: '直播录制任务', emptyText: '无录制任务', tasks: recordTasks.value },
])

// 在 setup 阶段就订阅（早于 onMounted）：播放页跳转后立即 emit 事件，
// 若等 mounted 再订阅，事件可能在订阅前发出而静默丢失。
// 保持函数引用一致，确保 EventBus.off 能正确移除监听器
const onDownloadTask = (payload: TaskPayload) => handleTask(payload, 'download')
const onRecordTask = (payload: TaskPayload) => handleTask(payload, 'record')

EventBus.on('download-task', onDownloadTask)
EventBus.on('record-task', onRecordTask)

onUnmounted(() => {
  EventBus.off('download-task', onDownloadTask)
  EventBus.off('record-task', onRecordTask)
})
</script>

<template>
  <div>
    <template v-for="group in taskGroups" :key="group.kind">
      <el-divider content-position="left" class="task-divider">
        {{ group.title }}
      </el-divider>

      <el-card v-if="group.tasks.length === 0" shadow="never">
        <div class="task-empty">
          {{ group.emptyText }}
        </div>
      </el-card>

      <template v-else>
        <el-card
          v-for="task in group.tasks" :key="task.getLiveId()" class="task-card"
          shadow="hover"
        >
          <div class="task-info">
            <div class="task-main">
              <el-tag v-if="task.isRunning()" type="primary" size="small" round class="task-tag">
                <el-icon class="is-loading">
                  <Loading />
                </el-icon>
                <span>运行中</span>
              </el-tag>
              <el-tag v-else type="success" size="small" round class="task-tag">
                <el-icon><Check /></el-icon>
                <span>已完成</span>
              </el-tag>
              <span class="task-path" :title="task.getFilePath()">{{ task.getFilePath() }}</span>
            </div>
            <div class="task-actions">
              <el-button v-if="task.isRunning()" type="danger" size="small" @click="task.stop()">
                结束
              </el-button>
              <template v-else>
                <el-button type="success" size="small" @click="task.openSaveDirectory()">
                  打开文件夹
                </el-button>
                <el-button size="small" @click="removeTask(task, group.kind)">
                  移除
                </el-button>
              </template>
            </div>
          </div>
        </el-card>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.task-divider {
  margin: 16px 0 12px;

  &:first-child {
    margin-top: 0;
  }
}

.task-card {
  margin-bottom: 12px;

  :deep(.el-card__body) {
    padding: 12px 16px;
  }
}

.task-empty {
  padding: 8px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.task-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.task-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.task-tag {
  flex-shrink: 0;

  .el-icon {
    margin-right: 4px;
  }
}

.task-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.task-actions {
  flex-shrink: 0;
}
</style>
