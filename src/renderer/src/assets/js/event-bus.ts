import type { Emitter } from 'mitt'
import type DownloadTask from './download-task.js'
import type RecordTask from './record-task.js'
import mitt from 'mitt'

// 定义所有事件及其参数类型
interface Events {
  'download-task': DownloadTask
  'record-task': RecordTask
  'change-selected-menu': string
  [key: string]: unknown
  [key: symbol]: unknown // 添加 symbol 类型索引签名
}

const emitter: Emitter<Events> = mitt<Events>()
export default emitter
