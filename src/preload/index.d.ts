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
  getConfig: (key: string, defaultValue: any) => Promise<any>
  setConfig: (key: string, value: any) => Promise<any>
  getDownloadDir: () => Promise<any>
  setFfmpegDir: (dir: string) => Promise<any>

  // 文件夹目录
  showItemInFolder: (filePath: string) => Promise<any>
  getDesktopPath: () => Promise<any>
  selectDirectory: () => Promise<any>

  // 播放
  openPlayer: (params: { title: string, streamPath: string, ffplayPath?: string }) => Promise<any>

  getPlatform: () => string
  // 可继续扩展更多API
}

declare global {
  interface Window {
    electron: electronAPI
    mainAPI: mainAPI
  }
}
