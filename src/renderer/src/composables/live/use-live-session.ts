import type { Ref } from 'vue'
import type { LiveDetail } from '../../services/api-types'
import { ElMessage } from 'element-plus'
import { ref } from 'vue'
import Apis from '../../services/apis'
import {
  buildPlaybackUrl,
  normalizeCarouselTime,
  pickPreferredStream,
  resolveCarouselImages,
} from '../../utils/live-stream'
import Tools from '../../utils/tools'

/** 直播详情形状见 services/api-types.ts（M6 起契约统一收敛到 api-types） */
export type { LiveDetail }

/**
 * 直播会话（从 LivePlayer.vue 拆出）：
 * 直播详情获取 + 本地 HTTP-FLV 会话生命周期（创建/停止/重启）。
 * 只管"拿地址、开会话"，不管播放器实例与重试节奏——
 * 播放器在 use-live-player，重试在 use-stream-retry，由组件编排。
 */
export function useLiveSession(options: {
  liveId: () => string
  /** 数据源：user=用户直播(getLiveOne)，open=开放公演(getOpenLiveOne) */
  source: () => string
  /** open 模式下的顶部头像（公演封面，完整 URL） */
  avatarUrl: () => string
  isRadio: () => boolean
  /** 卸载标记：置位后一切异步回包直接丢弃 */
  isDisposed: Ref<boolean>
  /** 头像上报给浮窗头部（fp-bar）展示 */
  onAvatar: (avatarUrl: string) => void
  /** 详情携带的在线人数上抛（归 use-live-polling 所有） */
  onOnlineNum: (num: number) => void
  /** 详情获取失败（通常直播已下架）：列表刷新 + 关闭浮窗 */
  onUnavailable: () => void
  /** 每次重建流之前调用：组件在此销毁播放器/复位媒体元素/清重试计时器 */
  onBeforeRebuild: () => void
  /** 会话启动（getOne 开始）时调用：组件在此复位重试计数与 loading 态 */
  onSessionStart: () => void
}) {
  const playStreamPath = ref('')
  const streamId = ref('')
  /** 流重启序号：拼进播放地址，防止同 URL 复用旧连接 */
  const streamRestartToken = ref(0)
  const coverImage = ref('')
  const realName = ref('')
  const userAvatar = ref('')
  /** 电台轮播图与切换间隔（毫秒） */
  const carousels = ref<string[]>([])
  const carouselTime = ref(5000)

  // 递增令牌：每次重启换新 id，旧会话的异步回包凭 id 失效
  let activeStreamRequestId = 0

  /** 直播详情与界面状态同步，不直接处理播放器 */
  function applyLiveDetail(data: LiveDetail) {
    coverImage.value = Tools.sourceUrl(data.coverPath)
    carousels.value = resolveCarouselImages(
      options.isRadio(),
      data.carousels?.carousels,
      data.coverPath,
      url => Tools.sourceUrl(url),
    )
    carouselTime.value = normalizeCarouselTime(data.carousels?.carouselTime)
    realName.value = data.user.userName
    // 头像：优先调用方传入（open 公演为封面），否则取详情的主播头像；open 模式无在线人数
    userAvatar.value = options.avatarUrl() || Tools.sourceUrl(data.user.userAvatar)
    options.onAvatar(userAvatar.value)
    if (typeof data.onlineNum === 'number')
      options.onOnlineNum(data.onlineNum)
  }

  async function fetchLiveDetail(): Promise<LiveDetail> {
    if (options.source() === 'open') {
      // 开放公演：getOpenLiveOne 返回 playStreams 数组，选高清（streamType 2），
      // 没有用户信息，用标题兜底
      const data = await Apis.instance().openLive(options.liveId())
      const stream = pickPreferredStream(data.playStreams)
      return {
        playStreamPath: stream?.streamPath || '',
        coverPath: data.coverPath || '',
        user: { userName: data.subTitle || data.title || '开放公演', userAvatar: '' },
        liveId: data.liveId,
      }
    }
    return await Apis.instance().live(options.liveId())
  }

  async function stopCurrentLiveStream() {
    const currentStreamId = streamId.value
    if (!currentStreamId)
      return
    streamId.value = ''
    try {
      await window.mainAPI.stopLiveStream(currentStreamId)
    }
    catch (err) {
      console.error('停止直播流失败:', err)
    }
  }

  async function startLiveStream(rtmpUrl: string, requestId: number) {
    // 主进程失败（如本地流媒体服务端口全部被占用）在这里显式提示：
    // 这条链路不经过 Apis.request，没有统一兜底弹窗
    let result
    try {
      result = await window.mainAPI.createLiveStream(rtmpUrl, options.liveId())
    }
    catch (err: any) {
      ElMessage.error(err?.message || '创建直播流失败')
      throw err
    }

    if (options.isDisposed.value || requestId !== activeStreamRequestId) {
      try {
        await window.mainAPI.stopLiveStream(result.liveId || options.liveId())
      }
      catch (err) {
        console.error('关闭过期直播流失败:', err)
      }
      return false
    }

    streamId.value = result.liveId
    playStreamPath.value = buildPlaybackUrl(result.url, streamRestartToken.value)
    return true
  }

  /** 首次进入 / 重试恢复：按最新 RTMP 地址重建本地 HTTP-FLV 会话 */
  async function restartLiveStream(rtmpUrl: string) {
    const requestId = ++activeStreamRequestId
    options.onBeforeRebuild()
    await stopCurrentLiveStream()
    if (options.isDisposed.value || requestId !== activeStreamRequestId)
      return false
    streamRestartToken.value++
    return await startLiveStream(rtmpUrl, requestId)
  }

  /** 会话入口：拿最新直播地址再开会话；失败视为直播下架 */
  async function getOne() {
    options.onSessionStart()
    try {
      const data = await fetchLiveDetail()
      if (options.isDisposed.value)
        return
      applyLiveDetail(data)
      await restartLiveStream(data.playStreamPath)
    }
    catch (error: any) {
      console.error('getOne()', error)
      // 详情失败的原因已由 Apis.request 统一弹窗提示（不在这里重复弹）；
      // 详情都取不到通常意味着直播已下架，走下架处理
      options.onUnavailable()
    }
  }

  /** 重试耗尽 / 组件卸载时：停止当前流并清空会话 */
  function stopStreamNow() {
    const currentStreamId = streamId.value
    if (!currentStreamId)
      return
    streamId.value = ''
    window.mainAPI.stopLiveStream(currentStreamId).catch((err) => {
      console.error('停止直播流失败:', err)
    })
  }

  /** 组件卸载：置位 disposed、令牌失效、停流。后续所有异步回包都会被丢弃 */
  function dispose() {
    options.isDisposed.value = true
    activeStreamRequestId++
    stopStreamNow()
  }

  return {
    playStreamPath,
    streamId,
    streamRestartToken,
    coverImage,
    realName,
    userAvatar,
    carousels,
    carouselTime,
    fetchLiveDetail,
    applyLiveDetail,
    getOne,
    restartLiveStream,
    stopCurrentLiveStream,
    stopStreamNow,
    dispose,
  }
}
