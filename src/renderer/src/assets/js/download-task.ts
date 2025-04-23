import Constants from './constants'

/**
 * 回放下载任务
 */
export default class DownloadTask {
  public progress: number = 0
  private _url!: string
  private _saveDirectory: string = '' // 需调用 async init() 异步赋值
  private _filename!: string
  private _onProgress: (progress: number) => void = () => {}

  private _onEnd: () => void = () => {}

  private _status: number = Constants.DownloadStatus.Prepared
  private _liveId!: string

  public constructor(url: string, filename: string, liveId: string) {
    this._url = url
    this._filename = filename
    this._liveId = liveId
    // 构造函数不能 async，异步初始化请调用 this.init()
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
    return `${this._saveDirectory}/${this._filename}`
  }

  public getLiveId() {
    return this._liveId
  }

  public setOnProgress(value: (progress: number) => void) {
    this._onProgress = value
  }

  public setOnEnd(value: () => void) {
    this._onEnd = value
  }

  public start(startListener: () => void) {
    this.init().then(() => {
      this._status = Constants.DownloadStatus.Downloading
      startListener()
      console.info('[download-task.ts] download task:', this._url, this._filename, this._liveId)
      // report initial progress to the callback
      this._onProgress(this.progress)
      // start download via main process
      window.mainAPI.downloadTaskStart(this._url, this._filename, this._liveId)
      // 监听下载进度
      window.mainAPI.downloadTaskProgress((liveId: string, time: string) => {
        if (liveId === this._liveId) {
          const [h, m, s] = time.split(':')
          const seconds = Number.parseInt(h) * 3600 + Number.parseInt(m) * 60 + Number.parseFloat(s)
          this._onProgress(seconds)
        }
      })
      // 监听下载完成
      window.mainAPI.downloadTaskEnd((liveId: string, _filePath: string) => {
        console.info('[download-task.ts] download task end:', liveId, this._liveId)
        if (liveId === this._liveId) {
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
