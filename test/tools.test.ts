import { describe, expect, it } from 'vitest'
import Tools from '../src/renderer/src/utils/tools'

describe('tools.timeToSecond', () => {
  it('解析 H:M:S 格式', () => {
    expect(Tools.timeToSecond('01:02:03')).toBe(3723)
    expect(Tools.timeToSecond('00:06:05')).toBe(365)
  })

  it('空串返回 0', () => {
    expect(Tools.timeToSecond('')).toBe(0)
  })
})

describe('tools.lyricsParse', () => {
  it('解析 [time]user\tcontent 行', () => {
    const lyrics = '[00:01.00]小明\t你好\n[00:02.50]小红\t晚安'
    expect(Tools.lyricsParse(lyrics)).toEqual([
      { time: '00:01.00', username: '小明', content: '你好' },
      { time: '00:02.50', username: '小红', content: '晚安' },
    ])
  })

  it('无 ] 的行被跳过', () => {
    expect(Tools.lyricsParse('plain line\n[00:01.00]a\tb')).toEqual([
      { time: '00:01.00', username: 'a', content: 'b' },
    ])
  })

  it('空歌词返回空数组', () => {
    expect(Tools.lyricsParse('')).toEqual([])
  })
})

describe('tools.dateFormat / taskFilename', () => {
  // 2026-09-05 02:03:04（本地时区）
  const ts = new Date(2026, 8, 5, 2, 3, 4).getTime()

  it('dateFormat 支持 yyyyMMddhhmmss（补零）', () => {
    expect(Tools.dateFormat(ts, 'yyyyMMddhhmmss')).toBe('20260905020304')
  })

  it('taskFilename 保持分钟精度文件名', () => {
    // 2026-09-05 02:03（本地时区）
    const minuteTs = new Date(2026, 8, 5, 2, 3).getTime()
    expect(Tools.taskFilename('陈观逸', minuteTs, 'mp4')).toBe('陈观逸202609050203.mp4')
    expect(Tools.taskFilename('陈观逸', minuteTs, 'flv', ' ')).toBe('陈观逸 202609050203.flv')
  })
})
