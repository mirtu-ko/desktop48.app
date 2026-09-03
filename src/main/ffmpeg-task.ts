import type { IpcMainInvokeEvent } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'

import { Database } from './database'
import { error, log, warn } from './logger'

const TIME_REGEX = /time=(\d+:\d+:\d+\.\d+)/

/** 主进程侧任务状态（对应 renderer services/task-payload.ts 的同名接口） */
interface TaskSnapshot {
  liveId: string
  url: string
  filename: string
  filePath: string
  saveDirectory: string
  status: 'running' | 'finish' | 'error'
  startedAt: number
  error?: string
}

// 所有运行中的 ffmpeg 进程（跨任务实例共享），供应用退出时统一优雅收尾
const activeProcesses = new Set<ChildProcess>()

/**
 * 应用退出时对所有 ffmpeg 写 'q' 优雅收尾；
 * 子进程会独立完成文件尾写入后自行退出，避免残留孤儿进程
 */
export function stopAllFfmpegTasks(): void {
  for (const ffmpeg of activeProcesses) {
    try {
      if (!ffmpeg.killed && ffmpeg.exitCode === null && ffmpeg.stdin)
        ffmpeg.stdin.write('q')
    }
    catch {
      // stdin 已关闭等场景忽略，进程即将随应用生命周期结束
    }
  }
}

interface FfmpegTaskConfig {
  /** IPC 通道名前缀，如 'downloadTask' / 'recordTask' */
  channelPrefix: string
  /** 日志前缀，如 'download.ts' / 'record.ts' */
  logTag: string
  /** ffmpeg 输出参数（位于 '-c copy' 之后、输出文件之前） */
  ffmpegArgs: string[]
}

/**
 * 注册一组由 ffmpeg 承担的任务 IPC 通道：
 * `${prefix}Start`(invoke) / `${prefix}Progress|End|Error`(send) / `${prefix}Stop:${liveId}`(once) / `${prefix}List|Remove`(invoke)
 */
function registerFfmpegTask(config: FfmpegTaskConfig): void {
  const { channelPrefix, logTag, ffmpegArgs } = config

  // 每个 liveId 当前进程的退出 Promise：重启前必须等上一进程完全退出（含写 'q' 收尾），避免两个 ffmpeg 同时写同一文件
  const closePromises = new Map<string, Promise<void>>()

  // 主进程维护的任务快照表：渲染端刷新后通过 List 通道恢复列表，直到显式 Remove 才删除
  const snapshots = new Map<string, TaskSnapshot>()

  // 查询当前所有任务快照，供渲染端刷新后恢复列表
  ipcMain.handle(`${channelPrefix}List`, () => Array.from(snapshots.values()))
  // 从快照表删除任务（对应渲染端移除卡片）
  ipcMain.handle(`${channelPrefix}Remove`, (_event: IpcMainInvokeEvent, liveId: string) => {
    snapshots.delete(liveId)
  })

  ipcMain.handle(`${channelPrefix}Start`, async (event: IpcMainInvokeEvent, url: string, filename: string, liveId: string) => {
    // 获取保存目录
    const saveDir: string = Database.instance().getConfig('downloadDirectory', '') as string
    if (!fs.existsSync(saveDir))
      throw new Error('保存目录不存在')
    const ffmpegDir: string = Database.instance().getConfig('ffmpegDirectory', '') as string
    if (!fs.existsSync(ffmpegDir))
      throw new Error('ffmpeg 目录不存在')
    // 检查 ffmpeg 二进制文件是否存在
    const ffmpegPath = path.join(ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    if (!fs.existsSync(ffmpegPath))
      throw new Error('ffmpeg 二进制文件不存在')
    const filePath = path.join(saveDir, filename)
    // 同一 liveId 上一进程可能仍在优雅退出（写文件尾），等待其完全退出后再启动
    const prevClose = closePromises.get(liveId)
    if (prevClose)
      await prevClose
    // spawn ffmpeg；输出参数由具体任务（MP4 转封装 / FLV 录制）提供
    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'info',
      '-y',
      '-i',
      url,
      '-c',
      'copy',
      ...ffmpegArgs,
      filePath,
    ])
    log(`[${logTag}]spawn ffmpeg start`, filePath)
    // 注册该任务的退出 Promise，供同 liveId 重启时等待收尾
    const closePromise = new Promise<void>((resolve) => {
      ffmpeg.once('close', () => resolve())
    })
    closePromises.set(liveId, closePromise)
    activeProcesses.add(ffmpeg)
    ffmpeg.once('close', () => activeProcesses.delete(ffmpeg))
    // 记录任务快照（running），供渲染端刷新后恢复
    snapshots.set(liveId, {
      liveId,
      url,
      filename,
      filePath,
      saveDirectory: saveDir,
      status: 'running',
      startedAt: Date.now(),
    })
    // 窗口销毁后不能再用 event.sender.send，否则会抛 "Object has been destroyed"
    const safeSend = (channel: string, ...args: unknown[]) => {
      if (!event.sender.isDestroyed())
        event.sender.send(channel, ...args)
    }
    // 解析 stderr 中的进度信息，推送给渲染进程
    ffmpeg.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      const match = msg.match(TIME_REGEX)
      if (match && match[1]) {
        log(`[${logTag}]spawn ffmpeg progress`, match[1])
        safeSend(`${channelPrefix}Progress`, liveId, match[1])
      }
      else {
        // 输出未匹配行便于调试
        log(`[${logTag}]ffmpeg stderr(no match):`, msg.trim())
      }
    })
    const startPromise = new Promise<string>((resolve, reject) => {
      ffmpeg.once('spawn', () => {
        resolve(filePath)
      })
      ffmpeg.once('error', (err) => {
        error(`[${logTag}]spawn ffmpeg error`, err)
        const errMsg = `[${logTag}]ffmpeg error: ${err.message}`
        // spawn 失败可能不触发 close，需在此清理注册表，否则同 liveId 后续 Start 会永久挂起
        activeProcesses.delete(ffmpeg)
        closePromises.delete(liveId)
        const snapshot = snapshots.get(liveId)
        if (snapshot) {
          snapshot.status = 'error'
          snapshot.error = errMsg
        }
        safeSend(`${channelPrefix}Error`, liveId, errMsg)
        reject(new Error(errMsg))
      })
    })
    // 支持外部 stop：向 ffmpeg stdin 写 'q' 优雅退出
    // 注意：Windows 上 kill('SIGINT') 实际是强杀进程，ffmpeg 来不及写文件尾
    // （MP4 的 moov atom / FLV 的 onMetaData），文件会损坏或时长异常；
    // 写 'q' 让 ffmpeg 自己收尾后再退出。
    // once 监听器在 close 时显式移除，避免同 liveId 多次重启导致监听器无限累积
    const stopChannel = `${channelPrefix}Stop:${liveId}`
    const stopListener = () => {
      if (!ffmpeg.killed && ffmpeg.exitCode === null) {
        try {
          ffmpeg.stdin.write('q')
          log(`[${logTag}]task stopped by user (graceful)`, liveId)
        }
        catch (e) {
          warn(`[${logTag}]graceful stop failed, fallback to kill`, e)
          ffmpeg.kill('SIGINT')
        }
      }
    }
    ipcMain.once(stopChannel, stopListener)
    // Handle close event; treat SIGINT as normal completion
    ffmpeg.on('close', (code, signal) => {
      ipcMain.removeListener(stopChannel, stopListener)
      closePromises.delete(liveId)
      // 更新快照状态：正常结束（含用户 stop）记为 finish，异常退出记为 error
      const snapshot = snapshots.get(liveId)
      if (code === 0 || signal === 'SIGINT') {
        log(`[${logTag}]spawn ffmpeg end`, liveId, filePath)
        if (snapshot)
          snapshot.status = 'finish'
        safeSend(`${channelPrefix}End`, liveId, filePath)
      }
      else {
        const errMsg = `[${logTag}]ffmpeg exited with code ${code}`
        if (snapshot) {
          snapshot.status = 'error'
          snapshot.error = errMsg
        }
        safeSend(`${channelPrefix}Error`, liveId, errMsg)
      }
    })

    // IPC 调用只表示 ffmpeg 已成功启动；任务结束由 End/Error 通道通知。
    return startPromise
  })
}

// ===== 任务注册 =====

// 下载任务：HLS TS → MP4
// -bsf:a aac_adtstoasc: HLS TS 里的 AAC 是 ADTS 格式，MP4 容器需要 ASC 格式，必须转封装
// -movflags +faststart: 正常结束时把 moov atom 移到文件头，播放器可立即打开
registerFfmpegTask({
  channelPrefix: 'downloadTask',
  logTag: 'download.ts',
  ffmpegArgs: ['-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart'],
})

// 录制任务：RTMP/HTTP 流 → FLV 文件
// -f flv: 将 RTMP/HTTP 流封装为 FLV 容器
// 如需断线重连，可追加 -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 2
registerFfmpegTask({
  channelPrefix: 'recordTask',
  logTag: 'record.ts',
  ffmpegArgs: ['-f', 'flv'],
})
