/* eslint-disable style/max-statements-per-line */
import type { IpcMainInvokeEvent } from 'electron'
import fs from 'node:fs'
import path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BaseWindow, BrowserWindow, dialog, ipcMain, net, powerSaveBlocker, shell } from 'electron'

import icon from '../../resources/icon.png?asset'
import './download.js'
import './record.js' // 录制功能主进程注册
import './stream.js' // 流媒体相关主进程注册
import './http-server.js'

// 日志重定向（ESM写法，无require）
const logPath = path.join(app.getPath('userData'), 'main.log')
const logStream = fs.createWriteStream(logPath, { flags: 'a' })
const origLog = console.log
const origErr = console.error
console.log = (...args) => { origLog(...args); logStream.write(`[LOG] ${args.join(' ')}\n`) }
console.error = (...args) => { origErr(...args); logStream.write(`[ERR] ${args.join(' ')}\n`) }

// 打印 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 打印日志
console.log('[index.ts] Electron index.ts __filename:', __filename)
console.log('[index.ts] Electron index.ts __dirname:', __dirname)
console.log('[index.ts] 日志目录:', logPath)
console.log('[index.ts] 主进程路径:', process.execPath)
console.log('[index.ts] 主进程工作目录:', process.cwd())
console.log('[index.ts] 预加载:', join(__dirname, '../preload/index.js'), fs.existsSync(join(__dirname, '../preload/index.js')))
console.log('[index.ts] 系统平台:', process.platform)
console.log('[index.ts] Electron 版本:', process.versions.electron)
console.log('[index.ts] Node.js 版本:', process.versions.node)
console.log('[index.ts] Chromium 版本:', process.versions.chrome)

// IPC 事件注册
ipcMain.handle('show-item-in-folder', (_event: IpcMainInvokeEvent, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled)
    return null
  return result.filePaths[0]
})

// path处理
ipcMain.handle('path-join', (_event: IpcMainInvokeEvent, ...paths: string[]) => path.join(...paths))

// 网络请求
if (!ipcMain.eventNames().includes('net-request')) {
  ipcMain.handle('net-request', async (_event: IpcMainInvokeEvent, options: any) => {
    return new Promise((resolve, reject) => {
      const request = net.request(options)
      if (options.headers) {
        for (const key in options.headers)
          request.setHeader(key, options.headers[key])
      }
      let data = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => resolve(data))
        response.on('error', reject)
      })
      request.on('error', reject)
      if (options.body)
        request.write(options.body)
      request.end()
    })
  })
}

ipcMain.handle('get-desktop-path', () => app.getPath('desktop'))

// ffmpeg 相关
ipcMain.handle('check-ffmpeg-binaries', async (_event: IpcMainInvokeEvent, dir: string) => {
  function ffmpegFullFilename(name: string): string {
    return process.platform === 'win32' ? `${name}.exe` : name
  }
  const ffmpegPath = path.join(dir, ffmpegFullFilename('ffmpeg'))
  const ffplayPath = path.join(dir, ffmpegFullFilename('ffplay'))
  if (!fs.existsSync(ffmpegPath))
    throw new Error('ffmpeg 不存在')
  if (!fs.existsSync(ffplayPath))
    throw new Error('ffplay 不存在')
  return true
})

function createWindow(): void {
  // 创建浏览器窗口。
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 在窗口关闭前清理 localStorage
  mainWindow.on('close', (event) => {
    console.log('[main] 主窗口即将关闭')
    // 阻止窗口立即关闭
    event.preventDefault()

    // 发送清理消息给渲染进程
    mainWindow.webContents.send('cleanup-storage')

    // 给渲染进程一点时间来处理清理
    setTimeout(() => {
      mainWindow.destroy() // 强制关闭窗口
    }, 150)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 基于 electron-vite CLI 的渲染进程热重载 (HMR)。
  // 开发环境加载远程 URL，生产环境加载本地 HTML 文件。
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  }
  else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', () => {
    console.log('[main] 主窗口即将关闭')
  })
}

// 当 Electron 完成初始化时会调用此方法，
// 并准备好创建浏览器窗口。
// 某些 API 只有在此事件发生后才能使用。
app.whenReady().then(() => {
  // 为 Windows 设置应用用户模型 ID。
  electronApp.setAppUserModelId('com.electron')

  // 在开发环境中按 F12 默认打开或关闭 DevTools，
  // 在生产环境中忽略 CommandOrControl + R。
  // 详情请参阅 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 创建窗口
  createWindow()

  app.on('activate', () => {
    // 在 macOS 上，当 Dock 图标被点击且没有其他窗口打开时，
    // 通常会重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
})

// 当所有窗口关闭时退出应用（macOS 除外），
// 在 macOS 上，应用及其菜单栏通常会保持活动状态，
// 直到用户使用 Cmd + Q 显式退出。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在此文件中，您可以包含应用主进程的其他特定代码，
// 也可以将它们放在单独文件中并在此处引入。

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    // 当运行第二个实例时，将会聚焦到我的窗口中
    const allWindows = BaseWindow.getAllWindows()
    if (allWindows) {
      allWindows[0].show()
    }
  })
}

// 注册阻止休眠的 IPC 处理程序
ipcMain.handle('prevent-sleep', () => {
  const id = powerSaveBlocker.start('prevent-display-sleep')
  console.log('[主进程] 已阻止系统休眠，ID:', id)
  return id
})

ipcMain.handle('allow-sleep', (_event, id: number) => {
  if (powerSaveBlocker.isStarted(id)) {
    powerSaveBlocker.stop(id)
    console.log('[主进程] 已允许系统休眠，ID:', id)
  }
})
