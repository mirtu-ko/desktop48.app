import ApiUrls from './api-urls'
import Request from './request'

/** 开放公演关联的队伍信息 */
export interface OpenLiveTeam {
  teamId: number
  groupId: number
  teamName: string
  teamColor?: string
}

/** 开放公演条目（getOpenLiveList 接口） */
export interface OpenLive {
  liveId: string
  title: string
  subTitle: string
  coverPath: string
  /** 1=未开始 2=进行中 4=已结束 */
  status: number
  /** 开演时间（毫秒时间戳） */
  stime: string
  /** 关联队伍，可能为空数组 */
  teamList?: OpenLiveTeam[]
}

export default class Apis {
  public static instance() {
    return this.apis
  }

  private static apis: Apis = new Apis()

  /**
   * 同步成员信息
   */
  public async syncInfo(): Promise<any> {
    console.log('[apis.ts]开始更新成员信息')
    // 更新数据到数据库
    const content = await this.request(ApiUrls.UPDATE_INFO_URL, {}, {})
    console.log('[apis.ts]更新成员信息', content)
    await window.mainAPI.saveMemberData(content)
    return content
  }

  /**
   * 直播列表
   * @param next
   */
  public lives(next: string = '0') {
    const data = {
      next,
      loadMore: 'true',
      userId: '0',
      teamId: '0',
      groupId: '0',
      record: 'false',
    }

    return this.list(data)
  }

  /**
   * 回放列表
   */
  public reviews({
    next = '0',
    userId = '0',
    teamId = '0',
    groupId = '0',
  }: {
    next: string
    userId: string
    teamId: string
    groupId: string
  }) {
    const data = {
      next,
      loadMore: 'true',
      userId,
      teamId,
      groupId,
      record: 'true',
    }

    return this.list(data)
  }

  public list(data: any) {
    return this.request(ApiUrls.LIVE_LIST_URL, data, {})
  }

  /**
   * 直播|回放详情
   * @param liveId 直播|回放id
   * @returns Promise
   */
  public live(liveId: any): Promise<any> {
    const data = {
      type: 1,
      userId: '0',
      liveId,
    }

    return this.request(ApiUrls.LIVE_ONE_URL, data, {})
  }

  /**
   * 开放公演详情
   * @param liveId 开放公演的 snowflake liveId（来自 getOpenLiveList）
   * @returns content，其中 roomId 是 live.48.cn 体系里的数字 id
   */
  public openLive(liveId: string): Promise<any> {
    const data = {
      liveId,
    }
    return this.request(ApiUrls.OPEN_LIVE_URL, data, {})
  }

  /**
   * 下载弹幕
   * @param barrageUrl 弹幕地址
   */
  public barrage(barrageUrl: string): Promise<any> {
    return Request.get(barrageUrl)
  }

  /**
   * 音乐专辑列表（CDN 静态 JSON，tag：ep=EP / zj=专辑 / sg=单曲）
   */
  public async musicAlbums(): Promise<any[]> {
    let data: any = await Request.get(ApiUrls.MUSIC_LIST_URL)
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      }
      catch (e) {
        console.warn('[apis.ts]musicAlbums 响应不是 JSON', e)
        throw new Error('[apis.ts]音乐专辑接口返回非JSON')
      }
    }
    return data?.all || [...(data?.ep || []), ...(data?.zj || []), ...(data?.sg || [])]
  }

  private async request(url: string, data: any, headers: any): Promise<any> {
    console.log('[apis.ts]request:', url, data)
    let responseBody = await Request.post(url, data, headers)
    if (typeof responseBody === 'string') {
      try {
        responseBody = JSON.parse(responseBody)
      }
      catch (e) {
        console.warn('[apis.ts]responseBody 不是 JSON', responseBody, e)
        throw new Error(`[apis.ts]接口返回非JSON：${responseBody}`)
      }
    }
    if (responseBody && responseBody.success) {
      return responseBody.content
    }
    else {
      const message = responseBody && responseBody.message ? responseBody.message : '接口无 success 字段'
      console.log('[apis.ts]reject', message)
      throw new Error(message)
    }
  }

  /**
   * 开放公演列表
   * @param groupId 团体 id：10=SNH 11=BEJ 12=GNZ 13=CKG 14=CGT，0=全部
   * @param next 翻页游标，首页传 '0'
   * @param record true=可回放的已结束公演，false=排期/进行中
   */
  public openLives(groupId: number = 0, next: string = '0', record: boolean = false) {
    const data = {
      groupId,
      next,
      debug: false,
      record,
    }
    console.log('[apis.ts]openLives', data)
    return this.request(ApiUrls.OPEN_LIVE_LIST_URL, data, {})
  }
}
