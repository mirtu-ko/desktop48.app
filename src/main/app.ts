import type { IpcMainInvokeEvent } from 'electron'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, net, powerSaveBlocker, shell } from 'electron'
import icon from '../../resources/icon.png?asset'

import { isAllowedUrl } from './allowed-hosts'
import { Database } from './database'
import { stopAllFfmpegTasks } from './ffmpeg-task' // 含下载/录制任务通道注册（side effect）
import { closeLog, getLogPathForDisplay, log } from './logger'
import './stream' // 流媒体相关主进程注册
import './http-server' // live中转服务器主进程注册

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

log('[app.ts] Electron app.ts __filename:', __filename)
log('[app.ts] Electron app.ts __dirname:', __dirname)
log('[app.ts] 日志目录:', getLogPathForDisplay())
log('[app.ts] 主进程路径:', process.execPath)
log('[app.ts] 主进程工作目录:', process.cwd())
log('[app.ts] 预加载:', join(__dirname, '../preload/index.js'), fs.existsSync(join(__dirname, '../preload/index.js')))
log('[app.ts] 系统平台:', process.platform)
log('[app.ts] Electron 版本:', process.versions.electron)
log('[app.ts] Node.js 版本:', process.versions.node)
log('[app.ts] Chromium 版本:', process.versions.chrome)

// IPC 事件注册

ipcMain.handle('open-path', async (_event: IpcMainInvokeEvent, filePath: string) => {
  // 校验路径：允许系统标准用户目录 + 用户配置的下载目录/ffmpeg目录
  const allowedRoots = [
    app.getPath('desktop'),
    app.getPath('downloads'),
    app.getPath('documents'),
    app.getPath('videos'),
    app.getPath('pictures'),
    app.getPath('music'),
    app.getPath('userData'),
  ]
  for (const key of ['downloadDirectory', 'ffmpegDirectory']) {
    const dir = Database.instance().getConfig(key, '') as string
    if (dir)
      allowedRoots.push(dir)
  }
  const resolved = path.resolve(filePath)
  // 必须比较到分隔符边界，否则 Downloads_backup 会被误判为在 Downloads 之内；
  // Windows 路径大小写不敏感，统一转小写后比较
  const normalize = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const target = normalize(resolved)
  const inAllowedRoot = allowedRoots.some((root) => {
    const rootPath = normalize(path.resolve(root))
    return target === rootPath || target.startsWith(rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep)
  })
  if (!inAllowedRoot) {
    throw new Error(`路径不在允许范围内: ${filePath}`)
  }
  // openPath 以返回值（而非 reject）报告失败，必须 await 并检查，否则错误被静默丢弃
  const failure = await shell.openPath(resolved)
  if (failure)
    throw new Error(failure)
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled)
    return null
  return result.filePaths[0]
})

ipcMain.handle('path-join', (_event: IpcMainInvokeEvent, ...paths: string[]) => path.join(...paths))

// 网络请求 - 域名白名单校验
const NET_REQUEST_TIMEOUT = 20 * 1000
const NET_REQUEST_MAX_BYTES = 32 * 1024 * 1024

ipcMain.handle('net-request', async (_event: IpcMainInvokeEvent, options: any) => {
  const url: string = typeof options === 'string' ? options : options?.url
  if (!url || !isAllowedUrl(url)) {
    throw new Error(`请求被拒绝：域名不在白名单中 (${url})`)
  }
  return new Promise<string>((resolve, reject) => {
    const request = net.request(options)
    if (options.headers) {
      for (const key in options.headers)
        request.setHeader(key, options.headers[key])
    }

    let settled = false
    const timer = setTimeout(() => {
      if (settled)
        return
      settled = true
      request.abort()
      reject(new Error(`请求超时（${NET_REQUEST_TIMEOUT}ms）: ${url}`))
    }, NET_REQUEST_TIMEOUT)

    const fail = (err: Error) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      reject(err)
    }
    const succeed = (data: string) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      resolve(data)
    }

    request.on('response', (response) => {
      // 必须先收齐 Buffer 再整体解码：逐块 toString 会把跨块的 UTF-8 多字节字符切成乱码
      const chunks: Buffer[] = []
      let received = 0
      response.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (received > NET_REQUEST_MAX_BYTES) {
          request.abort()
          fail(new Error(`响应体超过上限（${NET_REQUEST_MAX_BYTES} 字节）: ${url}`))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        const status = response.statusCode
        if (status < 200 || status >= 300) {
          fail(new Error(`请求失败 HTTP ${status}: ${url}`))
          return
        }
        succeed(Buffer.concat(chunks).toString('utf8'))
      })
      response.on('aborted', () => fail(new Error(`响应被中断: ${url}`)))
      response.on('error', (err: Error) => fail(err))
    })
    request.on('abort', () => fail(new Error(`请求被中断: ${url}`)))
    request.on('error', fail)
    if (options.body)
      request.write(options.body)
    request.end()
  })
})

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

// 保持对主窗口的引用，供自定义标题栏窗口控制使用
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // 创建浏览器窗口。
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    frame: false, // 纯自定义标题栏：去掉系统边框与默认按钮
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
    },
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })
  // 窗口销毁后必须解除引用：可选链挡不住已销毁对象，调用其方法会抛 "Object has been destroyed"
  win.on('closed', () => {
    if (mainWindow === win)
      mainWindow = null
  })
  wireWindowEvents(win)

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 基于 electron-vite CLI 的渲染进程热重载 (HMR)。
  // 开发环境加载远程 URL，生产环境加载本地 HTML 文件。
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 监听窗口最大化 / 还原状态变化并通知渲染进程
function wireWindowEvents(win: BrowserWindow): void {
  const send = () => {
    if (!win.isDestroyed())
      win.webContents.send('window-maximized-changed', win.isMaximized())
  }
  win.on('maximize', send)
  win.on('unmaximize', send)
}

// 取当前可用主窗口；窗口已销毁时返回 null
function activeWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed())
    return mainWindow
  return null
}

// 自定义标题栏窗口控制
ipcMain.handle('window-minimize', () => activeWindow()?.minimize())
ipcMain.handle('window-toggle-maximize', () => {
  const win = activeWindow()
  if (!win)
    return
  if (win.isMaximized())
    win.unmaximize()
  else
    win.maximize()
})
ipcMain.handle('window-close', () => activeWindow()?.close())
ipcMain.handle('window-is-maximized', () => activeWindow()?.isMaximized() ?? false)

// 当运行第二个实例时，聚焦到已有窗口（单实例锁在 index.ts 中已获取）
app.on('second-instance', () => {
  const win = activeWindow() ?? BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
  if (!win)
    return
  if (win.isMinimized())
    win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(() => {
  // 为 Windows 设置应用用户模型 ID。
  electronApp.setAppUserModelId('com.electron')

  // macOS 下 BrowserWindow 的 icon 选项无效，dev 模式运行的是原生 Electron.app，
  // 需要手动设置 Dock 图标；打包版由 build/icon.icns 提供，不受影响
  if (process.platform === 'darwin' && app.dock)
    app.dock.setIcon(icon)

  // dev 按 F12 开 DevTools、prod 屏蔽 Ctrl+R（electron-toolkit optimizer）
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
})

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // 直播流等子进程资源在 stream.ts 的 before-quit 里统一清理
  // 对仍在运行的所有 ffmpeg 任务写 'q' 优雅收尾，避免退出后残留孤儿进程
  stopAllFfmpegTasks()
  releaseAllSleepBlockers()
})

// 日志流最后关闭：必须晚于所有 before-quit 清理，否则清理阶段的日志会 write-after-end 被丢弃
app.on('will-quit', () => {
  closeLog()
})

// 阻止休眠：id 由主进程按 webContents 维护。
// 渲染进程刷新或崩溃时它无法把 id 传回来，只能由主进程在 webContents 销毁时兜底释放，
// 否则 blocker 会一直生效到应用退出。
const sleepBlockers = new Map<number, number>()

function releaseSleepBlocker(webContentsId: number): void {
  const blockerId = sleepBlockers.get(webContentsId)
  if (blockerId === undefined)
    return
  sleepBlockers.delete(webContentsId)
  if (powerSaveBlocker.isStarted(blockerId)) {
    powerSaveBlocker.stop(blockerId)
    log('[app.ts] 已允许系统休眠，ID:', blockerId)
  }
}

function releaseAllSleepBlockers(): void {
  for (const webContentsId of [...sleepBlockers.keys()])
    releaseSleepBlocker(webContentsId)
}

ipcMain.handle('prevent-sleep', (event) => {
  const webContentsId = event.sender.id
  // 幂等：同一 webContents 重复请求（如两次 playing 事件竞态）时复用已有 blocker，避免泄漏
  const existing = sleepBlockers.get(webContentsId)
  if (existing !== undefined && powerSaveBlocker.isStarted(existing))
    return existing

  const id = powerSaveBlocker.start('prevent-display-sleep')
  sleepBlockers.set(webContentsId, id)
  event.sender.once('destroyed', () => releaseSleepBlocker(webContentsId))
  log('[app.ts] 已阻止系统休眠，ID:', id)
  return id
})

ipcMain.handle('allow-sleep', (event, _id: number) => {
  // 以 webContents 为准，忽略渲染进程传来的 id：刷新后它持有的 id 已经失效
  releaseSleepBlocker(event.sender.id)
})
