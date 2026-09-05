import Constants from '../utils/constants'

export default class Request {
  /**
   * 发送post请求。主进程 netRequest 以 utf-8 字符串回包（可能不是合法 JSON，
   * 由 apis.request 统一解析），故返回 Promise<string>
   * @param url
   * @param body
   * @param headers
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

  /**
   * 发送get请求
   * @param url
   */
  public static async get(url: string, headers: Record<string, string> = {}): Promise<string> {
    headers['User-Agent'] = await window.mainAPI.getConfig('userAgent', Constants.DEFAULT_USER_AGENT)
    return window.mainAPI.netRequest({
      url,
      method: 'GET',
      headers,
    })
  }
}
