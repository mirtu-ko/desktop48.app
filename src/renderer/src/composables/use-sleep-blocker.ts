import { ref } from 'vue'

/**
 * 播放防休眠：持有 Electron 主进程的 powerSaveBlocker id，
 * 播放开始时 acquire、暂停/结束/卸载时 release。
 * LivePlayer（直播）与 ReviewPlayer（录播）共用。
 */
export function useSleepBlocker() {
  const id = ref<number | null>(null)

  async function acquire() {
    if (id.value !== null)
      return
    id.value = await window.mainAPI.preventSleep()
  }

  function release() {
    if (id.value === null)
      return
    window.mainAPI.allowSleep(id.value)
    id.value = null
  }

  return { acquire, release }
}
