/**
 * 媒体时长格式化：不足 1 小时显示 mm:ss，超过则 hh:mm:ss。
 * MiniControls 进度段与直播 LIVE 时长段共用，保证两条胶囊观感一致。
 */
export function formatMediaTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
}
