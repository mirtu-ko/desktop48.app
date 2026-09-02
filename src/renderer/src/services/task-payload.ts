/**
 * 下载/录制任务公共载荷
 */
export interface TaskPayload {
  url: string
  filename: string
  liveId: string
}

/**
 * 主进程任务快照：任务状态的真实来源（渲染端刷新后据此恢复列表）
 */
export interface TaskSnapshot {
  liveId: string
  url: string
  filename: string
  filePath: string
  saveDirectory: string
  status: 'running' | 'finish' | 'error'
  startedAt: number
  error?: string
}
