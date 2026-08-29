import type { TaskChannelAdapter } from './task-base'
import TaskBase from './task-base'

/**
 * 直播录制任务
 */
export default class RecordTask extends TaskBase {
  private static readonly channels: TaskChannelAdapter = {
    start: window.mainAPI.recordTaskStart,
    progress: window.mainAPI.recordTaskProgress,
    end: window.mainAPI.recordTaskEnd,
    error: window.mainAPI.recordTaskError,
    stop: window.mainAPI.recordTaskStop,
  }

  public constructor(url: string, filename: string, liveId: string) {
    super(RecordTask.channels, url, filename, liveId, 'record-task')
  }
}
