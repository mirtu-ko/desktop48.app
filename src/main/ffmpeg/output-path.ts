/**
 * 输出文件路径的纯函数集合（A-06 静默覆盖问题的修复落点之一）。
 * exists 以参数注入，脱离文件系统即可单测。
 */

/**
 * 返回一个不与现有文件冲突的输出路径：
 * 目标不存在时原样返回；冲突则自动追加 " (n)" 序号（从 2 起）直到可用。
 * 调用方负责"同一任务重启允许覆盖自己"的判断——那需要任务上下文，不属于本函数。
 */
export function nextAvailablePath(filePath: string, exists: (p: string) => boolean): string {
  if (!exists(filePath))
    return filePath
  const ext = filePath.match(/\.[^.\\/:*?"<>|]+$/)?.[0] ?? ''
  const stem = ext ? filePath.slice(0, -ext.length) : filePath
  let seq = 2
  while (exists(`${stem} (${seq})${ext}`))
    seq++
  return `${stem} (${seq})${ext}`
}
