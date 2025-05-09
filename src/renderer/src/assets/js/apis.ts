import { ref } from 'vue'
import ApiUrls from './api-urls.js'
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
          console.log('[apis.ts]更新成员信息', content)
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
    console.log('[apis.ts]request:', url, data)
    return new Promise((resolve, reject) => {
      Request.post(url, data, headers)
        .then((responseBody) => {
          // console.log('[apis.ts]response:', responseBody)
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

  /**
   * 获取公演信息
   */
  public shows(key): Promise<any> {
    console.log('[apis.ts]开始获取公演信息')
    const url = ref('')
    if (key === '1') {
      url.value = ApiUrls.SHOW_LIST_URL
    }
    else if (key === '2') {
      url.value = ApiUrls.BEJ_SHOW_LIST_URL
    }
    else if (key === '3') {
      url.value = ApiUrls.GNZ_SHOW_LIST_URL
    }
    else if (key === '5') {
      url.value = ApiUrls.CKG_SHOW_LIST_URL
    }
    else if (key === '6') {
      url.value = ApiUrls.CGT_SHOW_LIST_URL
    }
    else {
      console.error('[apis.ts]未知的 key', key)
      return Promise.reject(new Error(`[apis.ts]未知的 key ${key}`))
    }

    return new Promise((resolve, reject) => {
      Request.get(url.value)
        .then((html) => {
          // 使用正则表达式解析HTML内容
          const shows = this.parseShowsHtml(html)
          const watchContent = this.parseWatchContent(html)
          console.log('[apis.ts]parseShowsHtml', shows)
          console.log('[apis.ts]parseWatchContent', watchContent)
          resolve({
            shows,
            watchContent,
          })
        })
        .catch((error) => {
          reject(error)
        })
    })
  }

  private parseShowsHtml(html: string): Array<{
    id: number
    title: string
    date: string
    time: string
    image: string
  }> {
    const shows: Array<{
      id: number
      title: string
      date: string
      time: string
      image: string
    }> = []

    // 使用正则表达式匹配演出信息
    const regex = /<li class="starts">\s*<div class="startimg">\s*<img src="([^"]+)"[^>]*>\s*<span class="starttime">(\d+)日&nbsp;(\d+:\d+)<\/span>\s*<\/div>\s*<p>([^<]+)<\/p>/g
    let match: RegExpExecArray | null

    // eslint-disable-next-line no-cond-assign
    while ((match = regex.exec(html)) !== null) {
      shows.push({
        id: shows.length + 1,
        image: match[1],
        date: match[2],
        time: match[3],
        title: match[4].trim(),
      })
    }
    return shows
  }

  private parseWatchContent(html: string): Array<{
    id: number
    title: string
    image: string
    description: string
    startTime: number
    endTime: number
    status: string
  }> {
    const watchContents: Array<{
      id: number
      title: string
      image: string
      description: string
      startTime: number
      endTime: number
      status: string
    }> = []

    // 使用正则表达式匹配watchcontent信息
    const regex = /<div class="watchcontent">[\s\S]*?<div class="v-img"><a[^>]*?href="[^"]*?\/id\/(\d+)"[^>]*><img src="([^"]+)"[^>]*><\/a><\/div>[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?<p>&nbsp;&nbsp;([^<]+)<\/p>[\s\S]*?<input[^>]*?id="start_time_\d+"[^>]*?value="(\d+)"[^>]*>[\s\S]*?<input[^>]*?id="end_time_\d+"[^>]*?value="(\d+)"[^>]*>/g

    let match: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((match = regex.exec(html)) !== null) {
      watchContents.push({
        id: Number.parseInt(match[1]),
        image: match[2],
        title: match[3].trim(),
        description: match[4].trim(),
        startTime: Number.parseInt(match[5]),
        endTime: Number.parseInt(match[6]),
        status: 'upcoming', // 可以根据时间判断状态
      })
    }

    return watchContents
  }
}
