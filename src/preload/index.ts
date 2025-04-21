import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 渲染进程的自定义 API
const api = {}

// 使用 `contextBridge` API 将 Electron API 暴露给
// 渲染进程（启用上下文隔离时），否则
// 直接添加到全局 window。
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore（在 dts 文件中定义）
  window.electron = electronAPI
  // @ts-ignore（在 dts 文件中定义）
  window.api = api
}
