// 主进程网络请求白名单。
// 不再从渲染层的 api-urls.ts 派生：主进程的安全策略不应随渲染层文件改动而静默变化。
const ALLOWED_HOSTS = new Set([
  'pocketapi.48.cn',
  'www.cgt48.com',
  'b50.ckg48.com',
  'live.48.cn',
])

// 直播/点播的媒体域名由接口动态下发，无法枚举，按域名后缀兜底
const ALLOWED_HOST_SUFFIXES = ['.48.cn', '.snh48.com']

export function isAllowedUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:')
      return false
    const host = hostname.toLowerCase()
    return ALLOWED_HOSTS.has(host) || ALLOWED_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))
  }
  catch {
    return false
  }
}
