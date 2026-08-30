import type { Ref } from 'vue'
import { nextTick, ref } from 'vue'

export interface UseLoadMoreOptions {
  /** 触底加载回调：内部负责追加数据并维护 loading / noMore 状态 */
  load: () => Promise<void> | void
  /** 是否禁用触底加载（加载中或已无更多数据时返回 true，拦截重复请求） */
  disabled: Ref<boolean> | (() => boolean)
  /** 绑定到 el-scrollbar 的 ref，用于读取滚动位置；不传时内部自动创建 */
  scrollbarRef?: Ref<any>
  /** 距离底部多少像素视为触底，默认 10 */
  distance?: number
}

/**
 * 直播 / 回放 / 公演三个列表页共用的"加载更多"交互逻辑。
 * 依赖 el-scrollbar 的 end-reached 事件触发，同时手动校验滚动位置与禁用态，
 * 避免加载中 / 已无更多数据时重复请求导致分页数据错乱。
 */
export function useLoadMore({
  load,
  disabled,
  scrollbarRef = ref<any>(null),
  distance = 10,
}: UseLoadMoreOptions) {
  const isDisabled = (): boolean =>
    typeof disabled === 'function' ? disabled() : disabled.value

  async function onInfiniteScroll(): Promise<void> {
    if (isDisabled())
      return
    const wrap: HTMLElement | undefined = scrollbarRef.value?.wrapRef
    if (wrap) {
      const nearBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - distance - 1
      if (!nearBottom)
        return
    }
    await load()
    // 首屏只有零星几条时内容不足一屏，滚动条都不出现，end-reached 永远不会触发；
    // 这里在渲染完成后自动补齐下一页，直到填满视口或没有更多数据
    if (!wrap || isDisabled())
      return
    await nextTick()
    if (wrap.scrollHeight <= wrap.clientHeight) {
      await onInfiniteScroll()
    }
  }

  return { scrollbarRef, onInfiniteScroll }
}

export default useLoadMore
