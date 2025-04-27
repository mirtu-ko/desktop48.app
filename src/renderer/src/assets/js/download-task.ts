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

  public constructor(url: string, filename: string, liveId: string) {
    this._url = url
    this._filename = filename
    this._liveId = liveId
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

  public getLiveId() {
    return this._liveId
  }

  public setOnEnd(value: () => void) {
    this._onEnd = value
  }

  public start(startListener: () => void) {
    this.init().then(async () => {
      // compute full file path early for display during download
      this._filePath = await window.mainAPI.pathJoin(this._saveDirectory, this._filename)
      this._status = Constants.DownloadStatus.Downloading
      startListener()
      console.info('[download-task.ts] download task start:', this._url, this._filename, this._liveId)
      window.mainAPI.downloadTaskStart(this._url, this._filename, this._liveId)
      // 监听下载进度
      window.mainAPI.downloadTaskProgress((liveId: string, time: string) => {
        if (liveId === this._liveId) {
          console.log('[download-task.ts] download task progress:', liveId, time)
        }
      })
      // 监听下载完成
      window.mainAPI.downloadTaskEnd((liveId: string, _filePath: string) => {
        if (liveId === this._liveId) {
          this._filePath = _filePath
          this._status = Constants.DownloadStatus.Finish
          this._onEnd()
        }
      })
      // 监听下载错误
      window.mainAPI.downloadTaskError((liveId: string, error: any) => {
        if (liveId === this._liveId) {
          console.error('[download-task] download error', error)
        }
      })
    })
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
    console.info('download task stop')
    // invoke end callback
    this._onEnd()
  }

  public openSaveDirectory() {
    if (!this._saveDirectory) {
      console.error('saveDirectory is not initialized')
      return
    }
    window.mainAPI.showItemInFolder(this._saveDirectory)
  }
}
