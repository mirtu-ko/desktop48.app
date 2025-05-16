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
  getTeam: (teamId: number) => ipcRenderer.invoke('getTeam', teamId),
  hasMembers: () => ipcRenderer.invoke('hasMembers'),
  // 配置相关
  getConfig: (key: string, defaultValue: any) => ipcRenderer.invoke('getConfig', key, defaultValue),
  setConfig: (key: string, value: any) => ipcRenderer.invoke('setConfig', key, value),
  // 网络
  netRequest: (options: any) => ipcRenderer.invoke('net-request', options),
  // 播放
  openPlayer: (params: { title: string, streamPath: string, ffplayPath?: string }) => ipcRenderer.invoke('open-player', params),
  convertToHls: (rtmpUrl: string, liveId: string) => ipcRenderer.invoke('convertToHls', rtmpUrl, liveId),
  stopHlsConvert: (liveId: string) => ipcRenderer.invoke('stopHlsConvert', liveId),
  // 文件夹目录
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  checkFfmpegBinaries: (dir: string) => ipcRenderer.invoke('check-ffmpeg-binaries', dir),
  getPlatform: () => process.platform,
  pathJoin: (...paths: string[]) => ipcRenderer.invoke('path-join', ...paths),
  // 下载
  downloadTaskStart: (url: string, filename: string, liveId: string) => ipcRenderer.invoke('downloadTaskStart', url, filename, liveId),
  downloadTaskProgress: (callback: (liveId: string, time: string) => void) => {
    ipcRenderer.on('downloadTaskProgress', (_e, liveId, time) => callback(liveId, time))
  },
  downloadTaskEnd: (callback: (liveId: string, filePath: string) => void) => {
    ipcRenderer.on('downloadTaskEnd', (_e, liveId, filePath) => callback(liveId, filePath))
  },
  downloadTaskError: (callback: (liveId: string, error: any) => void) => {
    ipcRenderer.on('downloadTaskError', (_e, liveId, error) => callback(liveId, error))
  },
  downloadTaskStop: (liveId: string) => ipcRenderer.send(`downloadTaskStop:${liveId}`),
  // 录制
  recordTaskStart: (url: string, filename: string, liveId: string) => ipcRenderer.invoke('recordTaskStart', url, filename, liveId),
  recordTaskProgress: (callback: (liveId: string, time: string) => void) => {
    ipcRenderer.on('recordTaskProgress', (_e, liveId, time) => callback(liveId, time))
  },
  recordTaskEnd: (callback: (liveId: string, filePath: string) => void) => {
    ipcRenderer.on('recordTaskEnd', (_e, liveId, filePath) => callback(liveId, filePath))
  },
  recordTaskError: (callback: (liveId: string, error: any) => void) => {
    ipcRenderer.on('recordTaskError', (_e, liveId, error) => callback(liveId, error))
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
