<script setup lang="ts">
import type { Ref } from 'vue'
import type TaskBase from '../assets/js/task-base'
import type { TaskPayload, TaskSnapshot } from '../assets/js/task-payload'
import { Check, Download, Loading, VideoCamera } from '@element-plus/icons-vue'
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

// 分区展示配置：图标与主题色与底部 Dock 的语义保持一致（下载-绿 / 直播-玫红）
const taskGroups = computed(() => [
  { kind: 'record' as TaskKind, title: '直播录制', icon: VideoCamera, color: '#ff5e7e', emptyText: '暂无录制任务', tasks: recordTasks.value },
  { kind: 'download' as TaskKind, title: '回放下载', icon: Download, color: '#10b981', emptyText: '暂无下载任务', tasks: downloadTasks.value },
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
  <el-scrollbar
    class="scrollbar-wrapper"
    wrap-class="scrollbar-wrapper"
  >
    <div class="downloads-root">
      <section
        v-for="group in taskGroups"
        :key="group.kind"
        class="task-section"
        :style="{ '--group-color': group.color }"
      >
        <!-- 分区头：主题色图标 + 标题 + 任务数 -->
        <header class="section-head">
          <span class="section-icon">
            <el-icon><component :is="group.icon" /></el-icon>
          </span>
          <span class="section-title">{{ group.title }}</span>
          <span class="section-count">{{ group.tasks.length }}</span>
        </header>

        <!-- 空态 -->
        <div
          v-if="group.tasks.length === 0"
          class="empty-card glass-card"
        >
          <el-icon class="empty-icon">
            <component :is="group.icon" />
          </el-icon>
          <p>{{ group.emptyText }}</p>
        </div>

        <!-- 任务卡片列表 -->
        <div
          v-else
          class="task-list"
        >
          <article
            v-for="task in group.tasks"
            :key="task.getLiveId()"
            class="task-card glass-card"
          >
            <span
              class="task-icon"
              :class="{ 'is-running': task.isRunning() }"
            >
              <el-icon><component :is="group.icon" /></el-icon>
            </span>

            <div class="task-meta">
              <div
                class="task-name ellipsis"
                :title="task.getFilename()"
              >
                {{ task.getFilename() }}
              </div>
              <div
                v-if="task.getFilePath()"
                class="task-path ellipsis"
                :title="task.getFilePath()"
              >
                {{ task.getFilePath() }}
              </div>
            </div>

            <el-tag
              v-if="task.isRunning()"
              type="primary"
              size="small"
              round
              class="task-tag"
            >
              <el-icon class="is-loading">
                <Loading />
              </el-icon>
              <span>运行中</span>
            </el-tag>
            <el-tag
              v-else
              type="success"
              size="small"
              round
              class="task-tag"
            >
              <el-icon><Check /></el-icon>
              <span>已完成</span>
            </el-tag>

            <div class="task-actions">
              <el-button
                v-if="task.isRunning()"
                type="danger"
                size="small"
                round
                @click="task.stop()"
              >
                结束
              </el-button>
              <template v-else>
                <el-button
                  type="primary"
                  size="small"
                  round
                  @click="task.openSaveDirectory()"
                >
                  打开文件夹
                </el-button>
                <el-button
                  size="small"
                  round
                  @click="removeTask(task, group.kind)"
                >
                  移除
                </el-button>
              </template>
            </div>
          </article>
        </div>
      </section>
    </div>
  </el-scrollbar>
</template>

<style scoped lang="scss">
.downloads-root {
  max-width: 880px;
  margin: 0 auto;
  /* 底部留出悬浮 Dock 的高度，避免最后一张卡片被遮挡 */
  padding: 20px 24px 120px;
}

.task-section + .task-section {
  margin-top: 26px;
}

/* 分区头 */
.section-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;

  .section-icon {
    width: 28px;
    height: 28px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, color-mix(in srgb, var(--group-color) 75%, #fff), var(--group-color));
    color: #fff;
    box-shadow: 0 4px 10px -4px color-mix(in srgb, var(--group-color) 65%, transparent);

    .el-icon {
      font-size: 15px;
    }
  }

  .section-title {
    margin: 0;
    gap: 0;
    color: var(--el-text-color-primary);

    /* 已有主题色图标磁贴，隐藏全局 .section-title 的左侧竖条 */
    &::before {
      display: none;
    }
  }

  .section-count {
    min-width: 20px;
    height: 20px;
    padding: 0 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    font-size: 11px;
    font-weight: 600;
    background: color-mix(in srgb, var(--group-color) 12%, transparent);
    color: color-mix(in srgb, var(--group-color) 85%, #000);
  }
}

/* 空态：虚线玻璃卡 */
.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 80px 0;
  border-style: dashed;
  opacity: 0.9;

  &:hover {
    transform: none;
    box-shadow: var(--shadow-sm);
  }

  .empty-icon {
    font-size: 30px;
    color: var(--el-text-color-placeholder);
  }

  p {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-placeholder);
  }
}

/* 任务卡片：主题色磁贴 + 文件名/路径 + 状态 + 操作 */
.task-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 18px;
  border-radius: var(--radius-lg);

  & + .task-card {
    margin-top: 12px;
  }

  .task-icon {
    position: relative;
    flex-shrink: 0;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--group-color) 18%, #fff),
      color-mix(in srgb, var(--group-color) 8%, #fff)
    );
    border: 1px solid color-mix(in srgb, var(--group-color) 20%, transparent);
    color: var(--group-color);

    .el-icon {
      font-size: 20px;
    }

    /* 运行中：磁贴右上角呼吸圆点 */
    &.is-running::after {
      content: '';
      position: absolute;
      top: -3px;
      right: -3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--group-color);
      border: 2px solid var(--el-bg-color);
      animation: task-pulse 1.6s ease-in-out infinite;
    }
  }

  .task-meta {
    flex: 1;
    min-width: 0;

    .task-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .task-path {
      margin-top: 3px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }

  .task-tag {
    flex-shrink: 0;

    .el-icon {
      margin-right: 4px;
    }
  }

  .task-actions {
    flex-shrink: 0;
    display: flex;
  }
}

@keyframes task-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--group-color) 45%, transparent);
  }
  50% {
    box-shadow: 0 0 0 5px transparent;
  }
}
</style>
