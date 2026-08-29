import type { TaskChannelAdapter } from './task-base'
import TaskBase from './task-base'

/**
 * 回放下载任务
 */
export default class DownloadTask extends TaskBase {
  private static readonly channels: TaskChannelAdapter = {
    start: window.mainAPI.downloadTaskStart,
    progress: window.mainAPI.downloadTaskProgress,
    end: window.mainAPI.downloadTaskEnd,
    error: window.mainAPI.downloadTaskError,
    stop: window.mainAPI.downloadTaskStop,
  }

  public constructor(url: string, filename: string, liveId: string) {
    super(DownloadTask.channels, url, filename, liveId, 'download-task')
  }
}
