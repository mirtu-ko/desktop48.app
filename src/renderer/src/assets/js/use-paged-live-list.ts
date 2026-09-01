import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import useLoadMore from './use-load-more'

/** 直播 / 回放列表条目的最小结构 */
export interface PagedLive {
  liveId: string
  coverPath: string
  ctime: string
  userInfo: {
    userId: string
    nickname: string
    teamLogo: string
  }
  [key: string]: any
}

/** 分页接口返回结构 */
export interface PagedLiveResponse<T = PagedLive> {
  next: string
  liveList: T[]
}

export interface UsePagedLiveListOptions<T> {
  /** 请求一页数据：返回 { next, liveList }；通过闭包可注入筛选参数 */
  loadPage: (_next: string) => Promise<PagedLiveResponse<T>> | PagedLiveResponse<T>
  /** 并行补全单个条目的展示信息（封面 / 成员 / 日期等）；在过滤屏蔽成员之后执行 */
  processItem?: (_item: T, _index: number) => Promise<void> | void
  /** 是否在每次翻页前拉取并过滤被屏蔽成员，默认 true */
  filterBlocked?: boolean
  /** 请求失败时是否标记为"没有更多"，从而停止触底重试；Lives 默认 false，Reviews 为 true */
  stopOnError?: boolean
}

/**
 * 直播 / 回放列表共用的分页加载逻辑，抽取自 Lives.vue 与 Reviews.vue：
 * - 列表 / 游标 / loading / noMore 四件套
 * - 请求序号丢弃过期响应，避免刷新与滚动并发导致数据错乱
 * - 拉取被屏蔽成员并过滤
 * - 去重追加 + 触底加载（useLoadMore）
 * - 刷新重置
 */
export function usePagedLiveList<T extends PagedLive = PagedLive>({
  loadPage,
  processItem,
  filterBlocked = true,
  stopOnError = false,
}: UsePagedLiveListOptions<T>) {
  const list = ref<T[]>([]) as Ref<T[]>
  const listNext = ref('0')
  const loading = ref(false)
  const noMore = ref(false)

  const disabled = computed(() => loading.value || noMore.value)

  const blockedMemberIds = ref<number[]>([])
  async function updateBlockedMemberIds() {
    const blockedMembers = await window.mainAPI.getBlockedMembers()
    blockedMemberIds.value = blockedMembers.map(member => member.userId)
  }

  // 列表请求序号，用于丢弃过期响应，避免刷新/滚动并发时数据错乱
  let listRequestId = 0

  async function getList() {
    const requestId = ++listRequestId
    loading.value = true
    try {
      if (filterBlocked) {
        await updateBlockedMemberIds()
        if (requestId !== listRequestId)
          return
      }
      const content = await loadPage(listNext.value)
      if (requestId !== listRequestId)
        return
      if (!content || !Array.isArray(content.liveList)) {
        console.warn('liveList 不是数组或无内容', content?.liveList)
        noMore.value = true
        return
      }
      if (content.next === '0' || content.liveList.length === 0)
        noMore.value = true
      listNext.value = content.next

      // 先过滤被屏蔽成员，再并行补全展示信息，避免逐条串行 await 拖慢列表加载
      let visibleItems = content.liveList as T[]
      if (filterBlocked) {
        visibleItems = (content.liveList as T[]).filter(
          (item: any) => !blockedMemberIds.value.includes(Number.parseInt(item.userInfo.userId)),
        )
      }
      if (processItem)
        await Promise.all(visibleItems.map((item, index) => processItem(item, index)))
      if (requestId !== listRequestId)
        return
      // 兜底去重，避免接口分页边界返回重复项导致列表出现重复卡片
      const existedIds = new Set(list.value.map((item: any) => item.liveId))
      list.value.push(...visibleItems.filter((item: any) => !existedIds.has(item.liveId)))
    }
    catch (error) {
      if (requestId !== listRequestId)
        return
      console.info(error)
      if (stopOnError)
        noMore.value = true
    }
    finally {
      loading.value = false
    }
  }

  // 统一的触底加载：直播 / 回放 / 公演共用同一套交互逻辑
  const scrollbarRef = ref<any>(null)
  const { onInfiniteScroll } = useLoadMore({
    load: getList,
    disabled,
    scrollbarRef,
  })

  function refresh() {
    list.value = []
    listNext.value = '0'
    noMore.value = false
    getList()
  }

  return {
    list,
    listNext,
    loading,
    noMore,
    disabled,
    blockedMemberIds,
    updateBlockedMemberIds,
    scrollbarRef,
    onInfiniteScroll,
    getList,
    refresh,
  }
}

export default usePagedLiveList
