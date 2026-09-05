import type { TaskSnapshot } from '../src/main/ffmpeg/task-registry'
import { describe, expect, it } from 'vitest'
import { parseProgressTime } from '../src/main/ffmpeg/ffmpeg-process'
import { nextAvailablePath } from '../src/main/ffmpeg/output-path'
import { TaskRegistry } from '../src/main/ffmpeg/task-registry'

describe('parseProgressTime（ffmpeg stderr 进度解析）', () => {
  it('匹配 time=hh:mm:ss.xx 行', () => {
    expect(parseProgressTime('frame= 100 fps=30 time=00:01:23.45 bitrate=1000kbps')).toBe('00:01:23.45')
    expect(parseProgressTime('time=01:00:00.00')).toBe('01:00:00.00')
  })

  it('无匹配返回 null（含空串）', () => {
    expect(parseProgressTime('Input #0, hls')).toBeNull()
    expect(parseProgressTime('')).toBeNull()
  })
})

describe('nextAvailablePath（输出文件冲突序号，A-06）', () => {
  const existsOf = (taken: string[]) => (p: string) => taken.includes(p)

  it('目标不存在时原样返回', () => {
    expect(nextAvailablePath('/d/甲202609051200.mp4', existsOf([]))).toBe('/d/甲202609051200.mp4')
  })

  it('冲突时追加 (n) 序号，跳过已占用序号', () => {
    const taken = ['/d/a.mp4', '/d/a (2).mp4', '/d/a (3).mp4']
    expect(nextAvailablePath('/d/a.mp4', existsOf(taken))).toBe('/d/a (4).mp4')
    expect(nextAvailablePath('/d/a.mp4', existsOf(['/d/a.mp4']))).toBe('/d/a (2).mp4')
  })

  it('无扩展名文件也能处理', () => {
    expect(nextAvailablePath('/d/a', existsOf(['/d/a']))).toBe('/d/a (2)')
  })
})

describe('taskRegistry（快照 + closePromise 注册表）', () => {
  const snapshotOf = (liveId: string): TaskSnapshot => ({
    liveId,
    url: 'rtmp://x',
    filename: `${liveId}.mp4`,
    filePath: `/d/${liveId}.mp4`,
    saveDirectory: '/d',
    status: 'running',
    startedAt: 0,
  })

  it('list/remove/get 基本生命周期', () => {
    const registry = new TaskRegistry()
    registry.put(snapshotOf('a'))
    registry.put(snapshotOf('b'))
    expect(registry.list().map(s => s.liveId)).toEqual(['a', 'b'])
    registry.remove('a')
    expect(registry.get('a')).toBeUndefined()
    expect(registry.list().map(s => s.liveId)).toEqual(['b'])
  })

  it('markFinish/markError 只更新已存在的快照，不存在时静默', () => {
    const registry = new TaskRegistry()
    registry.put(snapshotOf('a'))
    registry.markFinish('a')
    expect(registry.get('a')!.status).toBe('finish')

    registry.put(snapshotOf('b'))
    registry.markError('b', 'boom')
    expect(registry.get('b')!.status).toBe('error')
    expect(registry.get('b')!.error).toBe('boom')
    // 不存在的 liveId 不抛错
    expect(() => registry.markFinish('ghost')).not.toThrow()
    expect(() => registry.markError('ghost', 'x')).not.toThrow()
  })

  it('closePromise 注册/等待/清除（同 liveId 重启串行保护）', async () => {
    const registry = new TaskRegistry()
    expect(registry.waitForClose('a')).toBeUndefined()

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    registry.registerClose('a', gate)
    expect(registry.waitForClose('a')).toBe(gate)

    let closed = false
    void registry.waitForClose('a')!.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    release()
    await gate
    expect(closed).toBe(true)

    registry.clearClose('a')
    expect(registry.waitForClose('a')).toBeUndefined()
  })
})
