import Constants from './constants'

/**
 * 直播录制任务
 */
export default class RecordTask {
  public progress: number = 0
  private _url!: string
  private _saveDirectory: string = '' // 需调用 async init() 异步赋值
  private _filename!: string
  private _onProgress: (progress: number) => void = () => {
  }

  private _onEnd: () => void = () => {
  }

  private _ffmpegCommand: any = null
  private _status: number = Constants.RecordStatus.Prepared
  private _liveId!: string
  private _duration: number = 0

  public constructor(url: string, filename: string, liveId: string) {
    this._url = url
    this._filename = filename
    this._liveId = liveId
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
    return `${this._saveDirectory}/${this._filename}`
  }

  public start(startListener: () => void) {
    // 此处需通过 window.electron 或主进程 IPC 实现录制任务
    // 原 ffmpeg 相关链式调用已移除
    // 示例：window.electron.startRecordTask({ url: this._url, filename: this._filename, ... })
    this._status = Constants.RecordStatus.Recording
    startListener()
    console.info('record task start')
    // 录制进度、完成、失败等回调逻辑请通过 IPC 消息与主进程通信实现
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
    window.mainAPI?.showItemInFolder?.(this.getFilePath())
  }

  private setDuration(timeMark: string) {
    const timeArray = timeMark.split(':')
    if (timeArray.length === 0)
      this._duration = 0
    const hours: number = Number.parseFloat(timeArray[0])
    const minutes: number = Number.parseFloat(timeArray[1])
    const seconds: number = Number.parseFloat(timeArray[2])
    this._duration = hours * 60 * 60 + minutes * 60 + seconds
    console.log('duration', this._duration)
  }
}
