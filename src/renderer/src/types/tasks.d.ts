export interface IDownloadTask {
  progress: number
  _url: string
  _filename: string
  _liveId: string
  getLiveId: () => string
  isDownloading: () => boolean
  isFinish: () => boolean
  getFilePath: () => string
  stop: () => void
  openSaveDirectory: () => void
  setOnProgress: (callback: (percent: number) => void) => void
  setOnEnd: (callback: () => void) => void
  start: (callback: () => void) => void
}

export interface IRecordTask {
  progress: number
  _url: string
  _filename: string
  _liveId: string
  getLiveId: () => string
  isRecording: () => boolean
  isFinish: () => boolean
  getFilePath: () => string
  stop: () => void
  openSaveDirectory: () => void
  start: (callback: () => void) => void
}
