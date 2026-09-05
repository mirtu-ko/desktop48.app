import type { electronAPI as ElectronAPI, mainAPI } from './api-types'
import { contextBridge, ipcRenderer } from 'electron'

// 替代 @electron-toolkit/preload，仅暴露渲染进程实际需要的最小 API
// sandbox 模式下 require 只能加载 electron 内置模块，无法 require 第三方包
const electronAPI = {
  process: {
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  },
} satisfies ElectronAPI

// 渲染进程的自定义 API
// satisfies mainAPI：实现与契约在编译期强制一致，新增/改名通道漏改任何一侧都会 typecheck 报错
const api = {
  saveMemberData: (data: any) => ipcRenderer.invoke('saveMemberData', data),
  // 成员
  getMember: (userId: number) => ipcRenderer.invoke('getMember', userId),
  getMemberTree: () => ipcRenderer.invoke('getMemberTree'),
  getBlockedMembers: () => ipcRenderer.invoke('getBlockedMembers'),
  setBlockedMembers: (ids: number[]) => ipcRenderer.invoke('setBlockedMembers', ids),
  addBlockedMember: (userId: number) => ipcRenderer.invoke('addBlockedMember', userId),
  removeBlockedMember: (userId: number) => ipcRenderer.invoke('removeBlockedMember', userId),
  hasMembers: () => ipcRenderer.invoke('hasMembers'),
  // 配置相关
  getConfig: (key: string, defaultValue?: any) => ipcRenderer.invoke('getConfig', key, defaultValue),
  setConfig: (key: string, value: any) => ipcRenderer.invoke('setConfig', key, value),
  // 网络
  netRequest: (options: any) => ipcRenderer.invoke('netRequest', options),
  // 播放
  createLiveStream: (rtmpUrl: string, liveId: string) => ipcRenderer.invoke('createLiveStream', rtmpUrl, liveId),
  stopLiveStream: (liveId: string) => ipcRenderer.invoke('stopLiveStream', liveId),
  // 文件夹目录
  openPath: (filePath: string) => ipcRenderer.invoke('openPath', filePath),
  getDesktopPath: () => ipcRenderer.invoke('getDesktopPath'),
  selectDirectory: () => ipcRenderer.invoke('selectDirectory'),
  checkFfmpegBinaries: (dir: string) => ipcRenderer.invoke('checkFfmpegBinaries', dir),
  getPlatform: () => process.platform,
  pathJoin: (...paths: string[]) => ipcRenderer.invoke('pathJoin', ...paths),
  // 下载
  downloadTaskStart: (url: string, filename: string, liveId: string) => ipcRenderer.invoke('downloadTaskStart', url, filename, liveId),
  downloadTaskProgress: (callback: (_liveId: string, _time: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, liveId: string, time: string) => callback(liveId, time)
    ipcRenderer.on('downloadTaskProgress', listener)
    return () => ipcRenderer.removeListener('downloadTaskProgress', listener)
  },
  downloadTaskEnd: (callback: (_liveId: string, _filePath: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, liveId: string, filePath: string) => callback(liveId, filePath)
    ipcRenderer.on('downloadTaskEnd', listener)
    return () => ipcRenderer.removeListener('downloadTaskEnd', listener)
  },
  downloadTaskError: (callback: (_liveId: string, _error: any) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, liveId: string, error: any) => callback(liveId, error)
    ipcRenderer.on('downloadTaskError', listener)
    return () => ipcRenderer.removeListener('downloadTaskError', listener)
  },
  downloadTaskStop: (liveId: string) => ipcRenderer.send(`downloadTaskStop:${liveId}`),
  downloadTaskList: () => ipcRenderer.invoke('downloadTaskList'),
  downloadTaskRemove: (liveId: string) => ipcRenderer.invoke('downloadTaskRemove', liveId),
  // 录制
  recordTaskStart: (url: string, filename: string, liveId: string) => ipcRenderer.invoke('recordTaskStart', url, filename, liveId),
  recordTaskProgress: (callback: (_liveId: string, _time: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, liveId: string, time: string) => callback(liveId, time)
    ipcRenderer.on('recordTaskProgress', listener)
    return () => ipcRenderer.removeListener('recordTaskProgress', listener)
  },
  recordTaskEnd: (callback: (_liveId: string, _filePath: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, liveId: string, filePath: string) => callback(liveId, filePath)
    ipcRenderer.on('recordTaskEnd', listener)
    return () => ipcRenderer.removeListener('recordTaskEnd', listener)
  },
  recordTaskError: (callback: (_liveId: string, _error: any) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, liveId: string, error: any) => callback(liveId, error)
    ipcRenderer.on('recordTaskError', listener)
    return () => ipcRenderer.removeListener('recordTaskError', listener)
  },
  recordTaskStop: (liveId: string) => ipcRenderer.send(`recordTaskStop:${liveId}`),
  recordTaskList: () => ipcRenderer.invoke('recordTaskList'),
  recordTaskRemove: (liveId: string) => ipcRenderer.invoke('recordTaskRemove', liveId),
  // 窗口控制
  windowMinimize: () => ipcRenderer.invoke('windowMinimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('windowToggleMaximize'),
  windowClose: () => ipcRenderer.invoke('windowClose'),
  windowIsMaximized: () => ipcRenderer.invoke('windowIsMaximized'),
  windowOnMaximizeChange: (callback: (_isMaximized: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('windowOnMaximizeChange', listener)
    return () => ipcRenderer.removeListener('windowOnMaximizeChange', listener)
  },
  // 阻止系统休眠
  preventSleep: () => ipcRenderer.invoke('preventSleep'),
  // 允许系统休眠
  allowSleep: (id: number) => ipcRenderer.invoke('allowSleep', id),
} satisfies mainAPI

// 经 contextBridge 暴露给渲染进程（上下文隔离已启用）
contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('mainAPI', api)
