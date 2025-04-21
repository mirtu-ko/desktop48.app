import ApiUrls from './api-urls.js'
// import Database removed, use window.mainAPI instead
import Request from './request.js'

export default class Apis {
  public static instance() {
    return this.apis
  }

  private static apis: Apis = new Apis()

  /**
   * 同步成员信息
   */
  public syncInfo(): Promise<any> {
    console.log('[apis.ts]开始更新成员信息')
    return new Promise((resolve, reject) => {
      this.request(ApiUrls.UPDATE_INFO_URL, {}, {})
        .then(async (content: any) => {
          // 更新数据到数据库
          await window.mainAPI.saveMemberData(content)
          resolve(content)
        })
        .catch((error) => {
          reject(error)
        })
    })
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
   * 下载弹幕
   * @param barrageUrl 弹幕地址
   */
  public barrage(barrageUrl: string): Promise<any> {
    return Request.get(barrageUrl)
  }

  private request(url: string, data: any, headers: any): Promise<any> {
    return new Promise((resolve, reject) => {
      Request.post(url, data, headers)
        .then((responseBody) => {
          console.log('[apis.ts]responseBody', responseBody)
          if (typeof responseBody === 'string') {
            try {
              responseBody = JSON.parse(responseBody)
            }
            catch (e) {
              console.warn('[apis.ts]responseBody 不是 JSON', responseBody, e)
              reject(new Error(`[apis.ts]接口返回非JSON：${responseBody}`))
              return
            }
          }
          if (responseBody && responseBody.success) {
            resolve(responseBody.content)
          }
          else {
            reject(responseBody && responseBody.message ? responseBody.message : '接口无 success 字段')
            console.log('[apis.ts]reject', responseBody && responseBody.message ? responseBody.message : '接口无 success 字段')
          }
        })
        .catch((error) => {
          console.error(error)
          throw new Error(`[apis.ts]request error ${error}`)
        })
    })
  }
}
