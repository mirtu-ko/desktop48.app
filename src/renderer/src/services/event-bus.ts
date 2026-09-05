import type { Emitter } from 'mitt'
import type { TaskPayload } from './task-payload'
import mitt from 'mitt'

// 定义所有事件及其参数类型。
// 新增事件必须在这里登记（含用途注释），便于全局检索事件的收发两端；
// index signature 仅为兼容 mitt 泛型约束保留，未登记的事件收不到类型提示
interface Events {
  'download-task': TaskPayload
  'record-task': TaskPayload
  /** 切换导航菜单（发送方各列表页，接收方 Index.vue） */
  'change-selected-menu': string
  /** 浮窗放流失败（流不存在/直播下架），参数为 liveId；Lives 页若该直播在列表中则自动刷新 */
  'live-unavailable': string
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
