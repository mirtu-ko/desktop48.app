import Constants from '../utils/constants'

export default class Request {
  /**
   * 发送 POST 请求。
   *
   * 所有网络请求都绕道主进程（★ 跨进程：preload → main/app.ts 的 'netRequest'），
   * 原因有二：渲染层受同源策略限制，且主进程侧有域名白名单（main/allowed-hosts.ts）。
   *
   * 主进程以 utf-8 字符串回包（可能不是合法 JSON，由 apis.request 统一解析），
   * 故返回 Promise<string> 而非对象。
   */
  public static async post(url: string, body: object, headers: Record<string, string> = {}): Promise<string> {
    headers['User-Agent'] = await window.mainAPI.getConfig('userAgent', Constants.DEFAULT_USER_AGENT)
    headers['Content-Type'] = 'application/json'
    return window.mainAPI.netRequest({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  }

  /** 发送 GET 请求。同样绕道主进程，说明见上方 post */
  public static async get(url: string, headers: Record<string, string> = {}): Promise<string> {
    headers['User-Agent'] = await window.mainAPI.getConfig('userAgent', Constants.DEFAULT_USER_AGENT)
    return window.mainAPI.netRequest({
      url,
      method: 'GET',
      headers,
    })
  }
}
