import { describe, expect, it } from 'vitest'
import { isAllowedUrl } from '../src/main/allowed-hosts'

describe('isAllowedUrl', () => {
  it('放行白名单内的精确域名', () => {
    expect(isAllowedUrl('https://pocketapi.48.cn/api/getInfo')).toBe(true)
    expect(isAllowedUrl('https://www.cgt48.com/')).toBe(true)
    expect(isAllowedUrl('https://b50.ckg48.com/')).toBe(true)
    expect(isAllowedUrl('http://live.48.cn/live/1.flv')).toBe(true)
  })

  it('按域名后缀放行动态下发的媒体域名', () => {
    expect(isAllowedUrl('https://al.hls.xiaoka.48.cn/stream.m3u8')).toBe(true)
    expect(isAllowedUrl('https://cdn.example.snh48.com/v.mp4')).toBe(true)
  })

  it('拒绝外部域名', () => {
    expect(isAllowedUrl('https://evil.com/api')).toBe(false)
    // 后缀匹配必须以 .48.cn 结尾，而不是包含 48.cn
    expect(isAllowedUrl('https://48.cn.evil.com/api')).toBe(false)
  })

  it('拒绝非 http/https 协议', () => {
    expect(isAllowedUrl('ftp://pocketapi.48.cn/file')).toBe(false)
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false)
  })

  it('非法 URL 返回 false 而非抛错', () => {
    expect(isAllowedUrl('not a url')).toBe(false)
    expect(isAllowedUrl('')).toBe(false)
  })
})
