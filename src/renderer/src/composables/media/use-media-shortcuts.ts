/**
 * 录播页键盘策略（M2 从 ReviewPlayer.vue 拆出）：
 * 绑定在根节点而不是 window——回放页会以多标签形式同时存在多个实例，
 * 只有获得焦点的那个才应该响应按键。
 * 注：LivePlayer 走的是另一套「hover 检测」策略（无焦点概念），两边改动请互相参照。
 */
export interface MediaShortcutActions {
  togglePlay: () => void
  toggleFullscreen: () => void
  /** 无弹幕能力的宿主可不传，D 键自动不响应 */
  toggleDanmaku?: () => void
  rotateLeft: () => void
  rotateRight: () => void
  resetRotation: () => void
}

export function useMediaShortcuts(options: {
  /** 焦点容器：快捷键只在它持有焦点时生效 */
  getRoot: () => HTMLElement | null
  /** 当前媒体元素：方向键 seek / 调音量直接操作它 */
  getMedia: () => HTMLMediaElement | null
  actions: MediaShortcutActions
}) {
  /** 点击播放器即把焦点收回根节点，让快捷键随即生效（点在按钮/输入上时保留其原生焦点） */
  function onPointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, button, [contenteditable="true"]'))
      return
    options.getRoot()?.focus({ preventScroll: true })
  }

  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
      return

    // 空格与方向键原生 controls 自身就会响应，焦点落在媒体元素或按钮上时必须交还给原生：
    // 否则会出现 keydown 由本组件暂停、keyup 又被按钮的默认激活行为恢复播放的重复触发。
    const nativeOwnsKey = event.key === ' ' || event.key.startsWith('Arrow')
    const focusInNativeControl = target
      && (target.tagName === 'VIDEO' || target.tagName === 'AUDIO' || target.tagName === 'BUTTON')
    if (nativeOwnsKey && focusInNativeControl)
      return

    const mediaElement = options.getMedia()
    const { actions } = options
    switch (event.key) {
      // 空格/播放键与迷你条统一走宿主的 togglePlay
      case ' ':
        actions.togglePlay()
        break
      case 'ArrowLeft':
        if (mediaElement)
          mediaElement.currentTime = Math.max(0, mediaElement.currentTime - 5)
        break
      case 'ArrowRight':
        if (mediaElement)
          mediaElement.currentTime = mediaElement.currentTime + 5
        break
      case 'ArrowUp':
        if (mediaElement)
          mediaElement.volume = Math.min(1, mediaElement.volume + 0.1)
        break
      case 'ArrowDown':
        if (mediaElement)
          mediaElement.volume = Math.max(0, mediaElement.volume - 0.1)
        break
      case 'd':
      case 'D':
        actions.toggleDanmaku?.()
        break
      case 'f':
      case 'F':
        actions.toggleFullscreen()
        break
      case 'r':
      case 'R':
        // 长按 repeat 只响应第一次，避免连续转圈
        if (event.repeat)
          return
        if (event.shiftKey)
          actions.rotateLeft()
        else
          actions.rotateRight()
        break
      case '0':
        if (event.repeat)
          return
        actions.resetRotation()
        break
      default:
        return
    }
    event.preventDefault()
  }

  return { onKeydown, onPointerDown }
}
