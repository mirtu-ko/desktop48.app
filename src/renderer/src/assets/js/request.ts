import Constants from './constants.js'

export default class Request {
  /**
   * 发送post请求
   * @param url
   * @param body
   * @param headers
   */
  public static async post(url: string, body: object, headers: any = {}): Promise<any> {
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
  public static async get(url: string, headers: any = {}): Promise<any> {
    headers['User-Agent'] = await window.mainAPI.getConfig('userAgent', Constants.DEFAULT_USER_AGENT)
    return window.mainAPI.netRequest({
      url,
      method: 'GET',
      headers,
    })
  }
}
