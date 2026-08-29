import Constants from './constants'

/**
 * 回放下载任务
 */
export default class DownloadTask {
  private _url!: string
  private _saveDirectory: string = ''
  private _filename!: string
  private _filePath: string = ''

  private _onEnd: () => void = () => {}

  private _status: number = Constants.DownloadStatus.Prepared
  private _liveId!: string

  // 保存已注册的 IPC 监听器取消函数，任务结束时统一移除，避免监听器泄漏
  private _unsubscribers: Array<() => void> = []

  public constructor(url: string, filename: string, liveId: string) {
    this._url = url
    this._filename = filename
    this._liveId = liveId
  }

  /**
   * 移除所有已注册的 IPC 监听器
   */
  private cleanupListeners() {
    for (const unsubscribe of this._unsubscribers)
      unsubscribe()
    this._unsubscribers = []
  }

  /**
   * 异步初始化，获取保存目录等
   */
  public async init() {
    this._saveDirectory = await window.mainAPI.getConfig('downloadDirectory', '')
  }

  public getUrl(): string {
    return this._url
  }

  public setUrl(value: string) {
    this._url = value
  }

  public getFilePath(): string {
    return this._filePath
  }

  public getFilename(): string {
    return this._filename
  }

  public getLiveId() {
    return this._liveId
  }

  public setOnEnd(value: () => void) {
    this._onEnd = value
  }

  public async start(startListener: () => void): Promise<void> {
    await this.init()
    // compute full file path early for display during download
    if (!this._saveDirectory)
      throw new Error('保存目录为空')

    this._filePath = await window.mainAPI.pathJoin(this._saveDirectory, this._filename)

    // 先注册监听器，避免 ffmpeg 启动后立即发送的事件丢失。
    this._unsubscribers.push(window.mainAPI.downloadTaskProgress((liveId: string, time: string) => {
        if (liveId === this._liveId) {
          console.log('[download-task.ts] download task progress:', liveId, time)
        }
      }))
    // 监听下载完成
    this._unsubscribers.push(window.mainAPI.downloadTaskEnd((liveId: string, _filePath: string) => {
        if (liveId === this._liveId) {
          this._filePath = _filePath
          this._status = Constants.DownloadStatus.Finish
          this.cleanupListeners()
          this._onEnd()
        }
      }))
    // 监听下载错误
    this._unsubscribers.push(window.mainAPI.downloadTaskError((liveId: string, error: any) => {
        if (liveId === this._liveId) {
          console.error('[download-task] download error', error)
          this._status = Constants.DownloadStatus.Finish
          this.cleanupListeners()
        }
      }))

    try {
      console.info('[download-task.ts] download task start:', this._url, this._filename, this._liveId)
      await window.mainAPI.downloadTaskStart(this._url, this._filename, this._liveId)
      this._status = Constants.DownloadStatus.Downloading
      startListener()
    }
    catch (error) {
      this.cleanupListeners()
      console.error('[download-task.ts] download task start failed', error)
      throw error
    }
  }

  public isDownloading() {
    return this._status === Constants.DownloadStatus.Downloading
  }

  public isFinish() {
    return this._status === Constants.DownloadStatus.Finish
  }

  public stop() {
    if (this._status !== Constants.DownloadStatus.Downloading) {
      return
    }
    window.mainAPI.downloadTaskStop(this._liveId)
    this._status = Constants.DownloadStatus.Finish
    this.cleanupListeners()
    console.info('download task stop')
    // invoke end callback
    this._onEnd()
  }

  public openSaveDirectory() {
    if (!this._saveDirectory) {
      console.error('saveDirectory is not initialized')
      return
    }
    window.mainAPI.openPath(this._saveDirectory)
  }
}
