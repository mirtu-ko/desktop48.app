import { describe, expect, it } from 'vitest'
import { fitAspectInBox } from '../src/renderer/src/utils/float-player-layout'

describe('fitAspectInBox', () => {
  it('宽屏比例受宽度约束时贴满宽度', () => {
    // 16:9 视频放进 800x450：800/1.7778 = 450，恰好铺满
    expect(fitAspectInBox(16 / 9, 800, 450)).toEqual({ w: 800, h: 450 })
  })

  it('竖屏比例受高度约束时贴满高度', () => {
    // 0.5（竖向）放进 800x450：w=800 → h=1600 超出 → h=450, w=225
    expect(fitAspectInBox(0.5, 800, 450)).toEqual({ w: 225, h: 450 })
  })

  it('结果四舍五入到整数像素', () => {
    // 100/1.7778 = 56.25 → 56
    expect(fitAspectInBox(16 / 9, 100, 100)).toEqual({ w: 100, h: 56 })
  })
})
