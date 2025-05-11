import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import { Database } from './database.js'

// 存储正在运行的转码进程
const streamProcesses = new Map()

// 清理临时目录
function cleanupTempDir() {
  try {
    const tempDir = path.join(app.getPath('temp'), 'desktop48_hls')
    if (fs.existsSync(tempDir)) {
      // 读取目录中的所有文件
      const files = fs.readdirSync(tempDir)

      // 删除所有文件
      for (const file of files) {
        const filePath = path.join(tempDir, file)
        try {
          fs.unlinkSync(filePath)
        }
        catch (err) {
          console.error(`[stream.ts] 删除临时文件失败: ${filePath}`, err)
        }
      }

      console.log('[stream.ts] 已清理HLS临时目录')
    }
  }
  catch (err) {
    console.error('[stream.ts] 清理临时目录失败:', err)
  }
}

// 在应用启动时清理临时目录
cleanupTempDir()

ipcMain.handle('convertToHls', async (_event, rtmpUrl: string) => {
  const ffmpegDir = Database.instance().getConfig('ffmpegDirectory')
  if (!ffmpegDir)
    throw new Error('尚未设置 ffmpeg 目录')

  const ffmpegPath = path.join(
    ffmpegDir,
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  )

  if (!fs.existsSync(ffmpegPath))
    throw new Error('ffmpeg 不存在')

  // 创建临时目录存放 HLS 文件
  const tempDir = path.join(app.getPath('temp'), 'desktop48_hls')
  console.log('[stream.ts] tempDir:', tempDir)
  if (!fs.existsSync(tempDir))
    fs.mkdirSync(tempDir, { recursive: true })

  const streamId = Math.random().toString(36).substring(2)
  const outputPath = path.join(tempDir, `${streamId}.m3u8`)

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-i',
      rtmpUrl,
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-f',
      'hls',
      '-hls_time',
      '2', // 减小分片时长为2秒
      '-hls_list_size',
      '6', // 增加列表大小为6，保持更多分片
      '-hls_flags',
      'delete_segments+append_list', // 添加append_list标志，避免重写整个m3u8
      '-hls_segment_type',
      'mpegts', // 明确指定分片类型
      '-hls_segment_filename',
      path.join(tempDir, `${streamId}_%03d.ts`), // 指定分片文件名格式
      outputPath,
    ])

    streamProcesses.set(streamId, ffmpeg)

    ffmpeg.stderr.on('data', (data) => {
      console.log(`[stream.ts] ffmpeg stderr: ${data}`)
    })

    ffmpeg.on('error', (err) => {
      console.error('[stream.ts] ffmpeg error:', err)
      reject(err)
    })

    // 等待生成两个分片文件后返回
    const checkFile = setInterval(() => {
      if (fs.existsSync(outputPath)) {
        // 检查是否有至少两个ts文件
        const tsFiles = fs.readdirSync(tempDir).filter(file =>
          file.startsWith(`${streamId}_`) && file.endsWith('.ts'),
        )

        if (tsFiles.length >= 2) {
          clearInterval(checkFile)
          resolve({
            url: `http://localhost:8080/${streamId}.m3u8`,
            streamId,
          })
        }
      }
    }, 1000)
  })
})

// 清理进程
ipcMain.handle('stopHlsConvert', (_event, streamId: string) => {
  const process = streamProcesses.get(streamId)
  if (process) {
    try {
      // 终止 ffmpeg 进程
      process.kill('SIGTERM') // 使用 SIGTERM 信号优雅地终止进程

      // 清理临时文件
      const tempDir = path.join(app.getPath('temp'), 'desktop48_hls')
      const m3u8File = path.join(tempDir, `${streamId}.m3u8`)

      // 读取 m3u8 文件以获取所有 ts 文件名
      if (fs.existsSync(m3u8File)) {
        const content = fs.readFileSync(m3u8File, 'utf8')
        const tsFiles = content.match(/.*\.ts/g) || []

        // 删除所有相关的 ts 文件
        tsFiles.forEach((tsFile) => {
          const tsPath = path.join(tempDir, tsFile)
          if (fs.existsSync(tsPath)) {
            try {
              fs.unlinkSync(tsPath)
            }
            catch (err) {
              console.error(`[stream.ts] 删除ts文件失败: ${tsPath}`, err)
            }
          }
        })

        // 删除 m3u8 文件
        try {
          fs.unlinkSync(m3u8File)
        }
        catch (err) {
          console.error(`[stream.ts] 删除m3u8文件失败: ${m3u8File}`, err)
        }
      }

      // 从进程映射中移除
      streamProcesses.delete(streamId)
      console.log(`[stream.ts] 已停止转码进程: ${streamId}`)
    }
    catch (err) {
      console.error(`[stream.ts] 停止转码进程失败: ${streamId}`, err)
      throw err
    }
  }
})
