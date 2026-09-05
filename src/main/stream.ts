import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import { Database } from './database'
import { serverHost, serverPort } from './http-server'
import { error, log } from './logger'

// 直播播放只在这里维护“会话”和“活跃转流进程”的状态。
// IPC 负责注册直播地址，HTTP 端点真正触发 FFmpeg 拉流并输出 HTTP-FLV。
interface StreamSession {
  sessionId: string
  liveId: string
  inputUrl: string
}

const streamSessions = new Map<string, StreamSession>()
const activeStreamProcesses = new Map<string, Set<ReturnType<typeof spawn>>>()

function getSafeLiveId(liveId: string) {
  return liveId.replace(/[^\w-]/g, '_') || 'live'
}

// 对外暴露的直播地址统一走本地 HTTP-FLV 路由，渲染进程不感知底层 FFmpeg 细节。
function getStreamRoute(liveId: string) {
  return `/live/${encodeURIComponent(getSafeLiveId(liveId))}.flv`
}

// 播放和录制都复用用户配置的 FFmpeg，可避免在项目里额外捆绑二进制。
function getFfmpegPath() {
  const ffmpegDir = Database.instance().getConfig('ffmpegDirectory')
  if (!ffmpegDir)
    throw new Error('尚未设置 ffmpeg 目录')

  const ffmpegPath = path.join(
    ffmpegDir,
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  )

  if (!fs.existsSync(ffmpegPath))
    throw new Error('ffmpeg 不存在')

  return ffmpegPath
}

function registerActiveProcess(sessionId: string, process: ReturnType<typeof spawn>) {
  const processSet = activeStreamProcesses.get(sessionId) ?? new Set<ReturnType<typeof spawn>>()
  processSet.add(process)
  activeStreamProcesses.set(sessionId, processSet)
}

function unregisterActiveProcess(sessionId: string, process: ReturnType<typeof spawn>) {
  const processSet = activeStreamProcesses.get(sessionId)
  if (!processSet)
    return

  processSet.delete(process)
  if (processSet.size === 0)
    activeStreamProcesses.delete(sessionId)
}

function stopProcess(process: ReturnType<typeof spawn>) {
  if (process.exitCode !== null || process.killed)
    return

  try {
    if (process.stdin && !process.stdin.destroyed) {
      process.stdin.write('q')
      process.stdin.end()
      return
    }
  }
  catch (err) {
    error('[stream.ts] 发送 FFmpeg 退出指令失败:', err)
  }

  try {
    process.kill('SIGTERM')
  }
  catch (err) {
    error('[stream.ts] 发送 FFmpeg 终止信号失败:', err)
    try {
      process.kill('SIGKILL')
    }
    catch (killErr) {
      error('[stream.ts] 强制结束 FFmpeg 失败:', killErr)
    }
  }
}

function stopActiveProcesses(sessionId: string) {
  const processSet = activeStreamProcesses.get(sessionId)
  if (!processSet)
    return

  for (const process of processSet)
    stopProcess(process)
}

export function createFlvStreamProcess(liveId: string) {
  const sessionId = getSafeLiveId(liveId)
  const session = streamSessions.get(sessionId)
  if (!session)
    throw new Error(`直播流不存在: ${liveId}`)

  const ffmpegPath = getFfmpegPath()
  const ffmpeg = spawn(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-rtmp_live',
    'live',
    '-i',
    session.inputUrl,
    '-map',
    '0:v:0?',
    '-map',
    '0:a:0?',
    '-c:v',
    'copy',
    '-c:a',
    'copy',
    '-f',
    'flv',
    'pipe:1',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  registerActiveProcess(sessionId, ffmpeg)

  ffmpeg.stderr.on('data', (data) => {
    log(`[stream.ts] ffmpeg stderr (${liveId}): ${data}`)
  })

  ffmpeg.on('error', (err) => {
    error(`[stream.ts] ffmpeg error (${liveId}):`, err)
  })

  ffmpeg.on('close', (code, signal) => {
    unregisterActiveProcess(sessionId, ffmpeg)
    log(`[stream.ts] ffmpeg closed (${liveId}), code=${code}, signal=${signal}`)
  })

  return ffmpeg
}

// 渲染进程只需要知道“这个直播可从哪个本地地址播放”，不直接管理 FFmpeg 进程。
ipcMain.handle('createLiveStream', async (_event, rtmpUrl: string, liveId: string) => {
  const sessionId = getSafeLiveId(liveId)
  const existingSession = streamSessions.get(sessionId)
  const publicPath = getStreamRoute(liveId)

  if (existingSession && existingSession.inputUrl === rtmpUrl) {
    return {
      // 用 127.0.0.1 而非 localhost：localhost 可能解析到 ::1，与回环 IPv4 监听不匹配。
      url: `http://${serverHost}:${serverPort()}${publicPath}`,
      liveId,
    }
  }

  streamSessions.set(sessionId, {
    sessionId,
    liveId,
    inputUrl: rtmpUrl,
  })

  return {
    url: `http://${serverHost}:${serverPort()}${publicPath}`,
    liveId,
  }
})

ipcMain.handle('stopLiveStream', async (_event, liveId: string) => {
  const sessionId = getSafeLiveId(liveId)
  const hadSession = streamSessions.delete(sessionId)
  stopActiveProcesses(sessionId)
  if (hadSession)
    log(`[stream.ts] 已移除直播会话: ${liveId}`)
})

app.on('before-quit', () => {
  for (const sessionId of activeStreamProcesses.keys())
    stopActiveProcesses(sessionId)

  streamSessions.clear()
  activeStreamProcesses.clear()
})
