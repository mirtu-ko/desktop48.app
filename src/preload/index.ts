import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload/index.ts]preload')

// 渲染进程的自定义 API
const api = {
  saveMemberData: (data: any) => ipcRenderer.invoke('save-member-data', data),
  // 数据库相关
  getMember: (userId: number) => ipcRenderer.invoke('getMember', userId),
  getMemberOptions: () => ipcRenderer.invoke('getMemberOptions'),
  getTeamOptions: () => ipcRenderer.invoke('getTeamOptions'),
  getGroupOptions: () => ipcRenderer.invoke('getGroupOptions'),
  getMemberTree: () => ipcRenderer.invoke('getMemberTree'),
  getHiddenMembers: () => ipcRenderer.invoke('getHiddenMembers'),
  setHiddenMembers: (ids: number[]) => ipcRenderer.invoke('setHiddenMembers', ids),
  getTeam: (teamId: number) => ipcRenderer.invoke('getTeam', teamId),
  hasMembers: () => ipcRenderer.invoke('hasMembers'),
  // 配置相关
  getConfig: (key: string, defaultValue: any) => ipcRenderer.invoke('getConfig', key, defaultValue),
  setConfig: (key: string, value: any) => ipcRenderer.invoke('setConfig', key, value),
  // 网络
  netRequest: (options: any) => ipcRenderer.invoke('net-request', options),
  // 播放
  openPlayer: (params: { title: string, streamPath: string, ffplayPath?: string }) => ipcRenderer.invoke('open-player', params),
  // 文件夹目录
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getPlatform: () => process.platform,
  // 其他
}

// 使用 `contextBridge` API 将 Electron API 暴露给
// 渲染进程（启用上下文隔离时），否则
// 直接添加到全局 window。
contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('mainAPI', api)
