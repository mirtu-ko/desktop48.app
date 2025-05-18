import type { IpcMainInvokeEvent } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { Database } from './database.js'

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
    console.log('[record.ts]spawn ffmpeg start', filePath)
    ffmpeg.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      const match = msg.match(/time=(\d+:\d+:\d+\.\d+)/)
      if (match && match[1]) {
        console.log('[record.ts]spawn ffmpeg progress', match[1])
        event.sender.send('recordTaskProgress', liveId, match[1])
      }
      else {
        console.log('[record.ts]ffmpeg stderr(no match):', msg.trim())
      }
    })
    // Handle process close; treat SIGINT (code null, signal 'SIGINT') as normal stop
    ffmpeg.on('close', (code, signal) => {
      if (code === 0 || signal === 'SIGINT') {
        console.log('[record.ts]spawn ffmpeg end', liveId, filePath)
        event.sender.send('recordTaskEnd', liveId, filePath)
        resolve(filePath)
      }
      else {
        const errMsg = `[record.ts]ffmpeg exited with code ${code}`
        event.sender.send('recordTaskError', liveId, errMsg)
        reject(new Error(errMsg))
      }
    })
    // 可选：支持外部 stop
    ipcMain.once(`recordTaskStop:${liveId}`, () => {
      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGINT')
        console.log('[record.ts]record task stopped by user', liveId)
      }
    })
  })
})
