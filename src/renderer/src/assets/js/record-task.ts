import Constants from './constants'

/**
 * 直播录制任务
 */
export default class RecordTask {
  public progress: number = 0
  private _url!: string
  private _saveDirectory: string = '' // 需调用 async init() 异步赋值
  private _filename!: string

  private _ffmpegCommand: any = null
  private _status: number = Constants.RecordStatus.Prepared
  private _liveId!: string

  private _onProgress: (progress: number) => void = () => {}
  private _onEnd: () => void = () => {}

  public setOnProgress(cb: (progress: number) => void) {
    this._onProgress = cb
  }

  public setOnEnd(cb: () => void) {
    this._onEnd = cb
  }

  public constructor(url: string, filename: string, liveId: string) {
    this._url = url
    this._filename = filename
    this._liveId = liveId
  }

  public async init() {
    this._saveDirectory = await window.mainAPI.getConfig('downloadDirectory', '')
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

  public getFilePath() {
    this.init()
    return `${this._saveDirectory}/${this._filename}`
  }

  public start(startListener: () => void) {
    this.init().then(() => {
    // 启动录制任务并监听主进程回调
      this._status = Constants.RecordStatus.Recording
      startListener()
      console.info('[record-task.ts] record task start:', this._url, this._filename, this._liveId)
      // 调用主进程IPC开始录制
      window.mainAPI.recordTaskStart?.(this._url, this._filename, this._liveId)
      // 监听录制进度
      window.mainAPI.recordTaskProgress?.((liveId: string, time: string) => {
        if (liveId === this._liveId) {
        // 解析时间字符串为秒数
          const [h, m, s] = time.split(':')
          const seconds = Number.parseInt(h) * 3600 + Number.parseInt(m) * 60 + Number.parseFloat(s)
          this.progress = seconds
          // 可扩展进度回调
          if (typeof this._onProgress === 'function') {
            this._onProgress(seconds)
          }
          console.log('[record-task.ts] record task progress:', liveId, seconds)
        }
      })
      // 监听录制完成
      window.mainAPI.recordTaskEnd?.((liveId: string, _filePath: string) => {
        if (liveId === this._liveId) {
          this._status = Constants.RecordStatus.Finish
          if (typeof this._onEnd === 'function') {
            this._onEnd()
          }
          console.info('[record-task.ts] record task end:', liveId)
        }
      })
      // 监听录制错误
      window.mainAPI.recordTaskError?.((liveId: string, error: any) => {
        if (liveId === this._liveId) {
          this._status = Constants.RecordStatus.Finish
          console.error('[record-task.ts] record error', error)
        }
      })
    })
  }

  public isRecording() {
    return this._status === Constants.RecordStatus.Recording
  }

  public isFinish() {
    return this._status === Constants.RecordStatus.Finish
  }

  public stop() {
    if (this._ffmpegCommand === null || this._status !== Constants.RecordStatus.Recording)
      return
    try {
      this._ffmpegCommand.ffmpegProc.stdin.write('q')
    }
    finally {
      this._status = Constants.RecordStatus.Finish
      console.info('record task stop')
    }
  }

  public openSaveDirectory() {
    this.init()
    window.mainAPI?.showItemInFolder?.(this.getFilePath())
  }
}
