import Constants from './constants'

/**
 * 直播录制任务
 */
export default class RecordTask {
  private _url!: string
  private _saveDirectory: string = '' // 需调用 async init() 异步赋值
  private _filename!: string
  private _filePath: string = ''

  private _status: number = Constants.RecordStatus.Prepared
  private _liveId!: string

  private _onEnd: () => void = () => {}

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

  public getFilePath(): string {
    return this._filePath
  }

  public start(startListener: () => void) {
    this.init().then(async () => {
      // compute full file path early for display during recording
      this._filePath = await window.mainAPI.pathJoin(this._saveDirectory, this._filename)
      this._status = Constants.RecordStatus.Recording
      startListener()
      console.info('[record-task.ts] record task start:', this._url, this._filename, this._liveId)
      // 调用主进程IPC开始录制
      window.mainAPI.recordTaskStart?.(this._url, this._filename, this._liveId)
      // 监听录制进度
      window.mainAPI.recordTaskProgress?.((liveId: string, time: string) => {
        if (liveId === this._liveId) {
          console.log('[record-task.ts] record task progress:', liveId, time)
        }
      })
      // 监听录制完成
      window.mainAPI.recordTaskEnd?.((liveId: string, _filePath: string) => {
        if (liveId === this._liveId) {
          this._filePath = _filePath
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
    console.info('record task stop')
    if (this._status !== Constants.RecordStatus.Recording) {
      // 已结束或未开始
      console.info('record task 已结束或未开始')
      return
    }
    try {
      console.info('record task stopping')
      window.mainAPI.recordTaskStop(this._liveId)
    }
    finally {
      this._status = Constants.RecordStatus.Finish
      console.info('record task stop')
    }
  }

  public openSaveDirectory() {
    this.init().then(() => {
      console.info('record task open save directory', this._saveDirectory)
      window.mainAPI?.showItemInFolder?.(this._saveDirectory)
    })
  }
}
