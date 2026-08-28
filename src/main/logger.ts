import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { app } from 'electron'

// 日志统一入口：
// - 显式 log/error/warn 函数，不再全局劫持 console（劫持会改变 Electron 内部行为，
//   且 args.join(' ') 会把对象打成 [object Object]，错误信息实际丢失）
// - 未捕获异常/unhandledRejection 落盘，崩溃后留有现场
// - 超过 5MB 自动轮转（main.log -> main.log.1），不会无限增长
// - 不再在退出时删除日志：崩溃排查完全依赖这份文件

const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'main.log')
}

function fmt(args: unknown[]): string {
  return args
    .map(a => (typeof a === 'string' ? a : util.inspect(a, { depth: 4, breakLength: 200 })))
    .join(' ')
}

function timestamp(): string {
  return new Date().toISOString()
}

// 启动时先轮转一次（此时流还没打开，Windows 上 rename 不会因为文件占用失败）
function rotateAtStartup(): void {
  const logPath = getLogPath()
  try {
    if (!fs.existsSync(logPath))
      return
    if (fs.statSync(logPath).size < MAX_LOG_SIZE)
      return
    const backup = `${logPath}.1`
    if (fs.existsSync(backup))
      fs.rmSync(backup)
    fs.renameSync(logPath, backup)
  }
  catch {
    // 轮转失败不影响启动
  }
}

rotateAtStartup()

let logStream = fs.createWriteStream(getLogPath(), { flags: 'a' })

// 运行中定期检查体积；轮转需要先关流再 rename，否则 Windows 下文件被占用会失败
function rotateIfNeeded(): void {
  try {
    const logPath = getLogPath()
    if (!fs.existsSync(logPath))
      return
    if (fs.statSync(logPath).size < MAX_LOG_SIZE)
      return
    logStream.end()
    const backup = `${logPath}.1`
    if (fs.existsSync(backup))
      fs.rmSync(backup)
    fs.renameSync(logPath, backup)
    logStream = fs.createWriteStream(logPath, { flags: 'a' })
  }
  catch {
    // 轮转失败时继续用旧流写
  }
}

setInterval(rotateIfNeeded, 10 * 60 * 1000).unref()

export function log(...args: unknown[]): void {
  console.log(...args)
  try {
    logStream.write(`${timestamp()} [LOG] ${fmt(args)}\n`)
  }
  catch { /* 写盘失败不影响业务 */ }
}

export function warn(...args: unknown[]): void {
  console.warn(...args)
  try {
    logStream.write(`${timestamp()} [WRN] ${fmt(args)}\n`)
  }
  catch { /* 写盘失败不影响业务 */ }
}

export function error(...args: unknown[]): void {
  console.error(...args)
  try {
    logStream.write(`${timestamp()} [ERR] ${fmt(args)}\n`)
  }
  catch { /* 写盘失败不影响业务 */ }
}

// 兜底：未捕获异常也写进日志。加了 handler 后进程不会因未捕获异常直接崩溃，
// 只记录并继续运行——桌面应用宁可带伤运行也不要闪退丢现场。
process.on('uncaughtException', (err) => {
  error('[logger] uncaughtException:', err)
})

process.on('unhandledRejection', (reason) => {
  error('[logger] unhandledRejection:', reason)
})

export function getLogPathForDisplay(): string {
  return getLogPath()
}

// 退出前刷盘。由 stream.ts 的 before-quit 在清理完子进程后最后调用，
// 保证退出过程中产生的日志（进程清理记录等）也能落盘。
export function closeLog(): void {
  try {
    logStream.end()
  }
  catch { /* 忽略 */ }
}
