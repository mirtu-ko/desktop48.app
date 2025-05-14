import type { IpcMainInvokeEvent } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BaseWindow, BrowserWindow, dialog, ipcMain, net, powerSaveBlocker, shell } from 'electron'

import icon from '../../resources/icon.png?asset'
import { Database } from './database.js'
import './download.js'
import './record.js' // 录制功能主进程注册
import './stream.js' // 流媒体相关主进程注册
import './http-server.js'

// 打印 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('[index.ts] Electron index.ts __dirname:', __dirname)
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

// 播放器相关
interface PlayerOptions {
  title: string
  streamPath: string
}

ipcMain.handle('open-player', async (_event: IpcMainInvokeEvent, { title, streamPath }: PlayerOptions) => {
  const ffmpegDir = Database.instance().getConfig('ffmpegDirectory')
  if (!ffmpegDir)
    throw new Error('尚未设置 ffmpeg 目录，请先在设置中选择 ffmpeg 路径')

  const ffplayPath = join(
    ffmpegDir,
    process.platform === 'win32' ? 'ffplay.exe' : 'ffplay',
  )
  if (!fs.existsSync(ffplayPath))
    throw new Error('ffplay 不存在于指定目录，请检查 ffmpeg 路径设置')

  try {
    const spawnOptions = process.platform === 'win32'
      ? { windowsHide: false }
      : {
          detached: true,
        }
    // 建议添加的 ffplay 参数：
    // -loglevel debug/verbose: 输出更详细的日志，有助于排查问题
    // -autoexit: 播放完毕后自动退出 ffplay
    // -exitonfailure: 遇到流错误或播放错误时自动退出 ffplay，防止假死
    // -rw_timeout <microseconds>: 设置网络I/O超时 (例如 15000000 for 15s)，避免因网络问题导致进程长时间等待
    // -probesize <bytes>: 设置探测数据大小 (例如 5242880 for 5MB)，影响流格式分析的准确性
    // -analyzeduration <microseconds>: 设置分析时长 (例如 5000000 for 5s)，影响流格式分析的深度
    // 您可以根据需要调整或添加其他参数
    const ffplayArgs = [
      '-loglevel',
      'debug', // 日志级别
      '-window_title',
      title, // 窗口标题
      '-infbuf', // 无限缓冲区
      '-framedrop', // 允许丢帧
      '-sync',
      'ext', // 外部时钟同步
      '-probesize',
      '5242880', // 5MB 的探测大小
      '-analyzeduration',
      '5000000', // 5秒的分析时长
      '-rw_timeout',
      '5000000', // 5秒的网络I/O超时
      '-autoexit', // 自动退出
      streamPath, // 流地址
    ]
    const child = spawn(ffplayPath, ffplayArgs, spawnOptions)

    child.stdout.on('data', (data) => {
      console.log(`[主进程] ffplay 输出: ${data}`)
    })

    child.stderr.on('data', (data) => {
      console.error(`[主进程] ffplay 错误: ${data}`)
    })

    child.on('error', (err) => {
      console.error('[主进程] ffplay 启动失败或进程错误:', err)
      // 可以在这里处理错误，例如通知用户
    })

    child.on('close', (code, signal) => {
      console.log(`[主进程] ffplay 进程退出，退出码: ${code}, 信号: ${signal}`)
      if (code !== 0 && code !== null) {
        console.error(`[主进程] ffplay 异常退出 (退出码: ${code})`)
        // 可以在这里处理 ffplay 异常退出的情况，例如通知用户
      }
    })
    return true
  }
  catch (err) {
    console.error('[主进程] open-player 捕获异常:', err)
    throw err // 将错误重新抛出，以便渲染进程可以捕获
  }
})

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

  // IPC 测试
  ipcMain.on('ping', () => console.log('pong'))

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
