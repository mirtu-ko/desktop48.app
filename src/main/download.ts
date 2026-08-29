import { registerFfmpegTask } from './ffmpeg-task'

// -bsf:a aac_adtstoasc: HLS TS 里的 AAC 是 ADTS 格式，MP4 容器需要 ASC 格式，必须转封装
// -movflags +faststart: 正常结束时把 moov atom 移到文件头，播放器可立即打开
registerFfmpegTask({
  channelPrefix: 'downloadTask',
  logTag: 'download.ts',
  ffmpegArgs: ['-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart'],
})
