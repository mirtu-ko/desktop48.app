import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { SafeJSONFileSync } from '../src/main/safe-json-file-sync'

/**
 * 数据库原子写适配器的行为测试。
 * 覆盖 2026-09-05 修复 A-02 时确认的关键语义：
 * 原子写 / .bak 存上一版 / 损坏隔离与回退 / 恢复后首写不覆盖唯一好副本
 */
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'desktop48-dbtest-'))
})

function newAdapter(file: string) {
  return new SafeJSONFileSync<{ starInfo: number[] }>(file)
}

describe('safeJSONFileSync', () => {
  it('写入后可原样读回（原子写 roundtrip）', () => {
    const file = join(dir, 'database.json')
    const adapter = newAdapter(file)

    adapter.write({ starInfo: [1, 2, 3] })

    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ starInfo: [1, 2, 3] })
    expect(adapter.read()).toEqual({ starInfo: [1, 2, 3] })
  })

  it('第二次写入后 .bak 保存的是上一版数据', () => {
    const file = join(dir, 'database.json')
    const adapter = newAdapter(file)

    adapter.write({ starInfo: [1, 2, 3] })
    adapter.write({ starInfo: [4, 5] })

    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf-8'))).toEqual({ starInfo: [1, 2, 3] })
    expect(adapter.read()).toEqual({ starInfo: [4, 5] })
  })

  it('主文件损坏时隔离为 .corrupt 并回退 .bak', () => {
    const file = join(dir, 'database.json')
    const adapter = newAdapter(file)

    adapter.write({ starInfo: [1, 2, 3] })
    adapter.write({ starInfo: [4, 5] })
    // 模拟写盘中途断电留下的半截文件
    writeFileSync(file, '{"starInfo":[4,TRUNCATED')

    expect(adapter.read()).toEqual({ starInfo: [1, 2, 3] })
    // 损坏文件被改名隔离而非删除，供人工排查
    expect(existsSync(`${file}.corrupt`)).toBe(true)
  })

  it('从 .bak 恢复后的首次写入不得用损坏主文件覆盖 .bak', () => {
    const file = join(dir, 'database.json')
    const adapter = newAdapter(file)

    adapter.write({ starInfo: [1, 2, 3] })
    adapter.write({ starInfo: [4, 5] })
    writeFileSync(file, '{"starInfo":[4,TRUNCATED')
    expect(adapter.read()).toEqual({ starInfo: [1, 2, 3] })

    // 此时 .bak（starInfo: [1,2,3]）是唯一好副本，主文件仍是损坏内容
    adapter.write({ starInfo: [6] })

    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf-8'))).toEqual({ starInfo: [1, 2, 3] })
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ starInfo: [6] })
  })

  it('恢复成功写入后恢复正常备份语义', () => {
    const file = join(dir, 'database.json')
    const adapter = newAdapter(file)

    // 两次写入后 .bak = [1,2,3]
    adapter.write({ starInfo: [1, 2, 3] })
    adapter.write({ starInfo: [4, 5] })
    writeFileSync(file, '{"broken')
    expect(adapter.read()).toEqual({ starInfo: [1, 2, 3] })
    // 恢复后的首次写入：.bak（唯一好副本）不得被覆盖
    adapter.write({ starInfo: [6] })
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf-8'))).toEqual({ starInfo: [1, 2, 3] })
    // 第二次写入起恢复正常：.bak = 上一版 [6]
    adapter.write({ starInfo: [7] })
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf-8'))).toEqual({ starInfo: [6] })
  })

  it('写入成功后不残留 tmp 文件', () => {
    const file = join(dir, 'database.json')
    const adapter = newAdapter(file)

    adapter.write({ starInfo: [1] })
    adapter.write({ starInfo: [2] })

    const files = readdirSync(dir)
    expect(files.some(name => name.includes('.tmp'))).toBe(false)
    expect(files.sort()).toEqual(['database.json', 'database.json.bak'])
  })
})
