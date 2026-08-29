import { registerFfmpegTask } from './ffmpeg-task'

// -f flv: 将 RTMP/HTTP 流封装为 FLV 容器
// 如需断线重连，可追加 -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 2
registerFfmpegTask({
  channelPrefix: 'recordTask',
  logTag: 'record.ts',
  ffmpegArgs: ['-f', 'flv'],
})
