/// <reference types="vite/client" />

// Electron 渲染进程注入的 process 全局对象（轻量声明，避免引入整个 @types/node）
interface Process {
  type: string
  platform: string
  versions: Record<string, string | undefined>
  env: Record<string, string | undefined>
}

declare const process: Process | undefined
