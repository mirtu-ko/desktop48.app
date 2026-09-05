import { describe, expect, it } from 'vitest'
import {
  buildPlaybackUrl,
  nextRetryAttempt,
  normalizeCarouselTime,
  pickPreferredStream,
  resolveCarouselImages,
} from '../src/renderer/src/utils/live-stream'

describe('pickPreferredStream（开放公演流选择）', () => {
  it('优先选高清流（streamType 2）', () => {
    const streams = [
      { streamPath: '/low.flv', streamType: 1 },
      { streamPath: '/hd.flv', streamType: 2 },
    ]
    expect(pickPreferredStream(streams)?.streamPath).toBe('/hd.flv')
  })

  it('无高清时取第一条有地址的流', () => {
    const streams = [
      { streamPath: '', streamType: 2 },
      { streamPath: '/only.flv', streamType: 1 },
    ]
    expect(pickPreferredStream(streams)?.streamPath).toBe('/only.flv')
  })

  it('空列表 / undefined 返回 null', () => {
    expect(pickPreferredStream([])).toBeNull()
    expect(pickPreferredStream(undefined)).toBeNull()
  })
})

describe('buildPlaybackUrl（本地 FLV 播放地址）', () => {
  it('拼接防缓存时间戳与重启序号', () => {
    expect(buildPlaybackUrl('http://127.0.0.1:8080/live/a.flv', 3, 1000)).toBe(
      'http://127.0.0.1:8080/live/a.flv?t=1000&r=3',
    )
  })

  it('默认使用当前时间', () => {
    const url = buildPlaybackUrl('http://x/a.flv', 1)
    expect(url).toMatch(/^http:\/\/x\/a\.flv\?t=\d+&r=1$/)
  })
})

describe('normalizeCarouselTime（轮播间隔归一化）', () => {
  it('合法值原样返回', () => {
    expect(normalizeCarouselTime(8000)).toBe(8000)
    expect(normalizeCarouselTime('6000')).toBe(6000)
  })

  it('缺省 / 非法值回退 5 秒', () => {
    expect(normalizeCarouselTime(undefined)).toBe(5000)
    expect(normalizeCarouselTime(null)).toBe(5000)
    expect(normalizeCarouselTime('')).toBe(5000)
    expect(normalizeCarouselTime('abc')).toBe(5000)
    expect(normalizeCarouselTime(-1)).toBe(5000)
  })
})

describe('resolveCarouselImages（轮播图列表）', () => {
  const toUrl = (u: string) => `https://cdn/${u}`

  it('非电台模式返回空数组', () => {
    expect(resolveCarouselImages(false, ['a.jpg'], 'cover.jpg', toUrl)).toEqual([])
  })

  it('接口返回 carousels 时逐个转 URL', () => {
    expect(resolveCarouselImages(true, ['a.jpg', 'b.jpg'], 'cover.jpg', toUrl)).toEqual([
      'https://cdn/a.jpg',
      'https://cdn/b.jpg',
    ])
  })

  it('无 carousels 时回退封面图单张', () => {
    expect(resolveCarouselImages(true, undefined, 'cover.jpg', toUrl)).toEqual(['https://cdn/cover.jpg'])
    expect(resolveCarouselImages(true, [], '', toUrl)).toEqual([])
  })
})

describe('nextRetryAttempt（重试决策）', () => {
  it('未达上限返回下一次序号', () => {
    expect(nextRetryAttempt(0, 3)).toBe(1)
    expect(nextRetryAttempt(2, 3)).toBe(3)
  })

  it('已达上限返回 null（走直播结束分支）', () => {
    expect(nextRetryAttempt(3, 3)).toBeNull()
    expect(nextRetryAttempt(4, 3)).toBeNull()
  })
})
