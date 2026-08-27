import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload/index.ts]preload')

// 渲染进程的自定义 API
const api = {
  saveMemberData: (data: any) => ipcRenderer.invoke('saveMemberData', data),
  // 成员
  getMember: (userId: number) => ipcRenderer.invoke('getMember', userId),
  getMemberOptions: () => ipcRenderer.invoke('getMemberOptions'),
  getTeamOptions: () => ipcRenderer.invoke('getTeamOptions'),
  getGroupOptions: () => ipcRenderer.invoke('getGroupOptions'),
  getMemberTree: () => ipcRenderer.invoke('getMemberTree'),
  getHiddenMembers: () => ipcRenderer.invoke('getHiddenMembers'),
  setHiddenMembers: (ids: number[]) => ipcRenderer.invoke('setHiddenMembers', ids),
  removeHiddenMember: (userId: number) => ipcRenderer.invoke('removeHiddenMember', userId),
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
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
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
  // 阻止系统休眠
  preventSleep: () => ipcRenderer.invoke('prevent-sleep'),
  // 允许系统休眠
  allowSleep: (id: number) => ipcRenderer.invoke('allow-sleep', id),
}

// 使用 `contextBridge` API 将 Electron API 暴露给
// 渲染进程（启用上下文隔离时），否则
// 直接添加到全局 window。
contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('mainAPI', api)
