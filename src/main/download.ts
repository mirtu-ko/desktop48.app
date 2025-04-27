import type { IpcMainInvokeEvent } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

import path from 'node:path'
import { ipcMain } from 'electron'

import { Database } from './database.js'

// IPC handler: start downloading m3u8 stream via ffmpeg
ipcMain.handle('downloadTaskStart', async (event: IpcMainInvokeEvent, url: string, filename: string, liveId: string) => {
  // 获取保存目录
  const saveDir: string = Database.instance().getConfig('downloadDirectory', '') as string
  if (!fs.existsSync(saveDir))
    throw new Error('保存目录不存在')
  const filePath = path.join(saveDir, filename)
  return new Promise<string>((resolve, reject) => {
    // spawn ffmpeg to download and merge ts segments
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-y', '-i', url, '-c', 'copy', filePath])
    console.log('[download.ts]spawn ffmpeg start', filePath)
    // 解析 stderr 中的进度信息，推送给渲染进程
    ffmpeg.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      const match = msg.match(/time=(\d+:\d+:\d+\.\d+)/)
      if (match && match[1]) {
        console.log('[download.ts]spawn ffmpeg progress', match[1])
        event.sender.send('downloadTaskProgress', liveId, match[1])
      }
      else {
        // 可选：输出未匹配行便于调试
        console.log('[download.ts]ffmpeg stderr(no match):', msg.trim())
      }
    })
    // Handle close event; treat SIGINT as normal completion
    ffmpeg.on('close', (code, signal) => {
      if (code === 0 || signal === 'SIGINT') {
        console.log('[download.ts]spawn ffmpeg end', liveId, filePath)
        event.sender.send('downloadTaskEnd', liveId, filePath)
        resolve(filePath)
      }
      else {
        const errMsg = `[download.ts]ffmpeg exited with code ${code}`
        event.sender.send('downloadTaskError', liveId, errMsg)
        reject(new Error(errMsg))
      }
    })
    ffmpeg.on('error', (err) => {
      console.error('[download.ts]spawn ffmpeg error', err)
      const errMsg = `[download.ts]ffmpeg error: ${err.message}`
      event.sender.send('downloadTaskError', liveId, errMsg)
      reject(new Error(errMsg))
    })
    // 可选：支持外部 stop
    ipcMain.once(`downloadTaskStop:${liveId}`, () => {
      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGINT')
        console.log('[download.ts]download task stopped by user', liveId)
      }
    })
  })
})
