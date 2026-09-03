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
}

// 渲染进程的自定义 API
const api = {
  saveMemberData: (data: any) => ipcRenderer.invoke('saveMemberData', data),
  // 成员
  getMember: (userId: number) => ipcRenderer.invoke('getMember', userId),
  getTeamOptions: () => ipcRenderer.invoke('getTeamOptions'),
  getGroupOptions: () => ipcRenderer.invoke('getGroupOptions'),
  getMemberTree: () => ipcRenderer.invoke('getMemberTree'),
  getBlockedMembers: () => ipcRenderer.invoke('getBlockedMembers'),
  setBlockedMembers: (ids: number[]) => ipcRenderer.invoke('setBlockedMembers', ids),
  addBlockedMember: (userId: number) => ipcRenderer.invoke('addBlockedMember', userId),
  removeBlockedMember: (userId: number) => ipcRenderer.invoke('removeBlockedMember', userId),
  hasMembers: () => ipcRenderer.invoke('hasMembers'),
  // 配置相关
  getConfig: (key: string, defaultValue: any) => ipcRenderer.invoke('getConfig', key, defaultValue),
  setConfig: (key: string, value: any) => ipcRenderer.invoke('setConfig', key, value),
  // 网络
  netRequest: (options: any) => ipcRenderer.invoke('net-request', options),
  // 播放
  createLiveStream: (rtmpUrl: string, liveId: string) => ipcRenderer.invoke('createLiveStream', rtmpUrl, liveId),
  stopLiveStream: (liveId: string) => ipcRenderer.invoke('stopLiveStream', liveId),
  // 文件夹目录
  openPath: (filePath: string) => ipcRenderer.invoke('open-path', filePath),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  checkFfmpegBinaries: (dir: string) => ipcRenderer.invoke('check-ffmpeg-binaries', dir),
  getPlatform: () => process.platform,
  pathJoin: (...paths: string[]) => ipcRenderer.invoke('path-join', ...paths),
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
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  windowOnMaximizeChange: (callback: (_isMaximized: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window-maximized-changed', listener)
    return () => ipcRenderer.removeListener('window-maximized-changed', listener)
  },
  // 阻止系统休眠
  preventSleep: () => ipcRenderer.invoke('prevent-sleep'),
  // 允许系统休眠
  allowSleep: (id: number) => ipcRenderer.invoke('allow-sleep', id),
}

// 经 contextBridge 暴露给渲染进程（上下文隔离已启用）
contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('mainAPI', api)
