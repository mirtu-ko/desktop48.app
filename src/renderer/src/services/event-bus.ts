import type { Emitter } from 'mitt'
import type { TaskPayload } from './task-payload'
import mitt from 'mitt'

// 定义所有事件及其参数类型
interface Events {
  'download-task': TaskPayload
  'record-task': TaskPayload
  'change-selected-menu': string
  [key: string]: unknown
  [key: symbol]: unknown
}

const emitter: Emitter<Events> = mitt<Events>()

/**
 * 订阅并返回卸载函数：mitt 的 on 本身不返回 off，这里补上"配对"语义。
 * 供非组件生命周期的持久订阅使用（组件内仍可 onMounted/onUnmounted 配对）。
 */
export function subscribe<Key extends keyof Events>(type: Key, handler: (event: Events[Key]) => void): () => void {
  emitter.on(type, handler)
  return () => emitter.off(type, handler)
}

export default emitter
