import type { IpcMainInvokeEvent } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { Database } from './database'
import { log, warn } from './logger'

const TIME_REGEX = /time=(\d+:\d+:\d+\.\d+)/

// IPC handler: start recording RTMP stream via ffmpeg
ipcMain.handle('recordTaskStart', async (event: IpcMainInvokeEvent, url: string, filename: string, liveId: string) => {
  // 获取保存目录
  const saveDir: string = Database.instance().getConfig('downloadDirectory', '') as string
  if (!fs.existsSync(saveDir))
    throw new Error('保存目录不存在')
  const ffmpegDir: string = Database.instance().getConfig('ffmpegDirectory', '') as string
  if (!fs.existsSync(ffmpegDir))
    throw new Error('ffmpeg 目录不存在')
  const ffmpegPath = path.join(ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (!fs.existsSync(ffmpegPath))
    throw new Error('ffmpeg 不存在于指定目录')
  const filePath = path.join(saveDir, filename)
  return new Promise<string>((resolve, reject) => {
    // spawn ffmpeg to record RTMP stream
    // -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 2 可选参数用于断线重连
    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'info',
      '-y',
      '-i',
      url,
      '-c',
      'copy',
      '-f',
      'flv',
      filePath,
    ])
    log('[record.ts]spawn ffmpeg start', filePath)
    ffmpeg.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      const match = msg.match(TIME_REGEX)
      if (match && match[1]) {
        log('[record.ts]spawn ffmpeg progress', match[1])
        event.sender.send('recordTaskProgress', liveId, match[1])
      }
      else {
        log('[record.ts]ffmpeg stderr(no match):', msg.trim())
      }
    })
    // Handle process close; treat SIGINT (code null, signal 'SIGINT') as normal stop
    ffmpeg.on('close', (code, signal) => {
      if (code === 0 || signal === 'SIGINT') {
        log('[record.ts]spawn ffmpeg end', liveId, filePath)
        event.sender.send('recordTaskEnd', liveId, filePath)
        resolve(filePath)
      }
      else {
        const errMsg = `[record.ts]ffmpeg exited with code ${code}`
        event.sender.send('recordTaskError', liveId, errMsg)
        reject(new Error(errMsg))
      }
    })
    // 支持外部 stop：向 ffmpeg stdin 写 'q' 优雅退出
    // 注意：Windows 上 kill('SIGINT') 实际是强杀进程，FLV 尾部元数据（时长/onMetaData）来不及写入，
    // 会导致录制文件时长显示错误或拖动异常；写 'q' 让 ffmpeg 自己收尾后再退出
    ipcMain.once(`recordTaskStop:${liveId}`, () => {
      if (!ffmpeg.killed && ffmpeg.exitCode === null) {
        try {
          ffmpeg.stdin.write('q')
          log('[record.ts]record task stopped by user (graceful)', liveId)
        }
        catch (e) {
          warn('[record.ts]graceful stop failed, fallback to kill', e)
          ffmpeg.kill('SIGINT')
        }
      }
    })
  })
})
