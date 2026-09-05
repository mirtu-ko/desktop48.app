/**
 * preload 类型声明（渲染进程通过 declare global 拿到 window.mainAPI 的类型）。
 * 接口本体已抽到 ./api-types 作为契约单一来源：index.ts 用 `satisfies mainAPI`
 * 在编译期校验实现一致，避免两份手工同步漂移。
 */
import type { electronAPI, mainAPI } from './api-types'

export type { BlockedMember, electronAPI, mainAPI, NetRequestOptions } from './api-types'

declare global {
  interface Window {
    electron: electronAPI
    mainAPI: mainAPI
  }
}
