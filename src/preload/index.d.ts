import type { electronAPI } from '@electron-toolkit/preload'

// 网络请求参数类型
export interface NetRequestOptions {
  url: string
  method: string
  headers?: Record<string, string>
  body?: any
}

// 主 API 类型定义
export interface mainAPI {
  // 网络
  netRequest: (options: NetRequestOptions) => Promise<any>

  // 团队与分组
  saveMemberData: (content: any) => Promise<any>
  getTeamOptions: () => Promise<Array<{ label: string, value: number }>>
  getGroupOptions: () => Promise<Array<{ label: string, value: number }>>
  getTeam: (teamId: number) => Promise<any>
  hasMembers: () => Promise<any>

  // 数据库相关
  getMember: (userId: number) => Promise<any>
  getMemberTree: () => Promise<any[]>
  getMemberOptions: () => Promise<Array<{ label: string, value: number }>>
  getHiddenMembers: () => Promise<any>
  setHiddenMembers: (ids: number[]) => Promise<any>
  removeHiddenMember: (userId: number) => Promise<any>
  getConfig: (key: string, defaultValue?: any) => Promise<any>
  setConfig: (key: string, value: any) => Promise<any>
  getDownloadDir: () => Promise<any>
  setFfmpegDir: (dir: string) => Promise<any>

  // 文件夹目录
  showItemInFolder: (filePath: string) => Promise<any>
  checkFfmpegBinaries: (dir: string) => Promise<any>
  getDesktopPath: () => Promise<any>
  selectDirectory: () => Promise<any>
  pathJoin: (...paths: string[]) => Promise<string>

  // 播放
  openPlayer: (params: { title: string, streamPath: string, ffplayPath?: string }) => Promise<any>
  convertToHls: (rtmpUrl: string, liveId) => Promise<any>
  stopHlsConvert: (liveId: string) => Promise<any>

  // 下载
  downloadTaskStart: (url: string, filename: string, liveId: string) => Promise<any>
  downloadTaskProgress: (callback: (liveId: string, time: string) => void) => void
  downloadTaskEnd: (callback: (liveId: string, filePath: string) => void) => void
  downloadTaskError: (callback: (liveId: string, error: any) => void) => void
  downloadTaskStop: (liveId: string) => void
  getPlatform: () => string
  // 录制
  recordTaskStart: (url: string, filename: string, liveId: string) => Promise<any>
  recordTaskProgress: (callback: (liveId: string, time: string) => void) => void
  recordTaskEnd: (callback: (liveId: string, filePath: string) => void) => void
  recordTaskError: (callback: (liveId: string, error: any) => void) => void
  recordTaskStop: (liveId: string) => void
  // 可继续扩展更多API
}

declare global {
  interface Window {
    electron: electronAPI
    mainAPI: mainAPI
  }
}
