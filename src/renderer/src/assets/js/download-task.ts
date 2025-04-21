import Constants from './constants'
// import Database removed, use window.mainAPI instead
// [提示] 所有 ffmpeg 相关逻辑需通过主进程/IPC 桥接

/**
 * 回放下载任务
 */
export default class DownloadTask {
  public progress: number = 0
  private _url!: string
  private _saveDirectory: string = '' // 需调用 async init() 异步赋值
  private _filename!: string
  private _onProgress: (progress: number) => void = () => {
  }

  private _onEnd: () => void = () => {
  }

  private _ffmpegCommand: any = null
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
    this._saveDirectory = await window.mainAPI.getConfig('donwloadDirectory', '')
  }

  public getUrl(): string {
    return this._url
  }

  public setUrl(value: string) {
    this._url = value
  }

  public getSaveDirectory(): string {
    return this._saveDirectory
  }

  public setSaveDirectory(value: string) {
    this._saveDirectory = value
  }

  public getFilename(): string {
    return this._filename
  }

  public setFilename(value: string) {
    this._filename = value
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

  public getFilePath() {
    console.log('getFilePath', this._saveDirectory, this._filename)
    return `${this._saveDirectory}/${this._filename}`
  }

  public start(startListener: () => void) {
    this._status = Constants.DownloadStatus.Downloading
    startListener()
    console.info('download task start', this._url, this._filename, this._liveId)
    // 启动 Electron 主进程下载
    window.mainAPI.startDownloadTask({
      url: this._url,
      filename: this._filename,
      liveId: this._liveId,
    })
    console.info('download task start end')
    // 监听进度
    window.mainAPI.onDownloadProgress((progress: number) => {
      if (this._onProgress)
        this._onProgress(progress)
    })
    // 监听结束
    window.mainAPI.onDownloadEnd(() => {
      this._status = Constants.DownloadStatus.Finish
      if (this._onEnd)
        this._onEnd()
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
    window.mainAPI.stopDownloadTask(this._liveId)
    this._status = Constants.DownloadStatus.Finish
    console.info('download task stop')
  }

  public openSaveDirectory() {
    window.mainAPI?.showItemInFolder?.(this.getFilePath())
  }
}
