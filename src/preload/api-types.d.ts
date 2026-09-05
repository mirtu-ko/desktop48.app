/**
 * preload API 契约的单一来源：
 * - `index.ts` 用 `satisfies mainAPI` 在编译期校验实现与契约一致（新增/改名通道漏改会直接 typecheck 报错）
 * - `index.d.ts` 从这里取类型，通过 `declare global` 暴露给渲染进程的 `window.mainAPI`
 * 修改任何通道签名时，只需改这里一处，两侧自动受检
 */

// 网络请求参数类型
export interface NetRequestOptions {
  url: string
  method: string
  headers?: Record<string, string>
  body?: any
}

// 最小化 electronAPI 类型（替代 @electron-toolkit/preload）
export interface electronAPI {
  process: {
    platform: string
    versions: {
      electron: string
      chrome: string
      node: string
    }
  }
}

// 与 renderer composables/use-blocked-members.ts 的 BlockedMember 同构（跨进程镜像）
export interface BlockedMember {
  userId: number
  realName: string
  teamColor: string
  [key: string]: any
}

// 主 API 类型定义
export interface mainAPI {
  // 网络
  netRequest: (options: NetRequestOptions) => Promise<any>

  // 团队与分组
  saveMemberData: (content: any) => Promise<any>
  hasMembers: () => Promise<any>

  // 数据库相关
  getMember: (userId: number) => Promise<any>
  getMemberTree: () => Promise<any[]>
  getBlockedMembers: () => Promise<BlockedMember[]>
  setBlockedMembers: (ids: number[]) => Promise<any>
  addBlockedMember: (userId: number) => Promise<any>
  removeBlockedMember: (userId: number) => Promise<any>
  getConfig: (key: string, defaultValue?: any) => Promise<any>
  setConfig: (key: string, value: any) => Promise<any>

  // 文件夹目录
  openPath: (filePath: string) => Promise<any>
  checkFfmpegBinaries: (dir: string) => Promise<any>
  getDesktopPath: () => Promise<any>
  selectDirectory: () => Promise<any>
  pathJoin: (...paths: string[]) => Promise<string>

  // 播放
  createLiveStream: (rtmpUrl: string, liveId: string) => Promise<any>
  stopLiveStream: (liveId: string) => Promise<any>

  // 下载
  downloadTaskStart: (url: string, filename: string, liveId: string) => Promise<any>
  downloadTaskProgress: (callback: (liveId: string, time: string) => void) => () => void
  downloadTaskEnd: (callback: (liveId: string, filePath: string) => void) => () => void
  downloadTaskError: (callback: (liveId: string, error: any) => void) => () => void
  downloadTaskStop: (liveId: string) => void
  downloadTaskList: () => Promise<any[]>
  downloadTaskRemove: (liveId: string) => Promise<void>
  getPlatform: () => string
  // 录制
  recordTaskStart: (url: string, filename: string, liveId: string) => Promise<any>
  recordTaskProgress: (callback: (liveId: string, time: string) => void) => () => void
  recordTaskEnd: (callback: (liveId: string, filePath: string) => void) => () => void
  recordTaskError: (callback: (liveId: string, error: any) => void) => () => void
  recordTaskStop: (liveId: string) => void
  recordTaskList: () => Promise<any[]>
  recordTaskRemove: (liveId: string) => Promise<void>

  // 休眠
  preventSleep: () => Promise<any>
  allowSleep: (id: number) => Promise<any>

  // 窗口控制
  windowMinimize: () => Promise<any>
  windowToggleMaximize: () => Promise<any>
  windowClose: () => Promise<any>
  windowIsMaximized: () => Promise<boolean>
  windowOnMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
}
