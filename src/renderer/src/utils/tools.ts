const YI_ZHI_BO_HOST = 'alcdn.hls.xiaoka.tv'

class Tools {
  private static readonly STREAM_PATH_REGEX = /^(http|https):\/\/([^/]+)\/(\d+)/

  /**
   * 将相对路径 / 相对图片路径归一化为 source.48.cn 完整 URL；已是完整 URL 时原样返回
   */
  private static toSourceUrl(path: string): string {
    if (path.includes('http'))
      return path
    return `https://source.48.cn${path}`
  }

  private static readonly DATE_FORMAT_REGEXES: Record<string, RegExp> = {
    'M+': /(M+)/,
    'd+': /(d+)/,
    'h+': /(h+)/,
    'm+': /(m+)/,
    's+': /(s+)/,
    'q+': /(q+)/,
    'S': /(S)/,
  }

  private static readonly YEAR_REGEX = /(y+)/

  /**
   * 将逗号分隔的图片路径转换为完整的URL数组
   * @param picturesStr 逗号分隔的图片路径字符串
   * @returns {string[]} 完整的图片URL数组
   */
  public static pictureUrls(picturesStr: string) {
    return picturesStr.split(',').map(picture => Tools.toSourceUrl(picture))
  }

  public static sourceUrl(sourcePath: string) {
    return Tools.toSourceUrl(sourcePath)
  }

  public static timeToSecond(time: string): number {
    if (!time) {
      return 0
    }
    const [hours, minutes, seconds] = time.split(':')
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  }

  public static lyricsParse(lyrics: string) {
    if (!lyrics) {
      console.error('lyrics undefined')
      return []
    }
    const barrages: any[] = []
    const lines = lyrics.split('\n')
    lines.forEach((line: string) => {
      const tmp = line.split(']')
      if (tmp.length > 1) {
        const arr = tmp[1].split('\t')
        barrages.push({
          time: tmp[0].replace('[', ''),
          username: arr[0],
          content: arr[1],
        })
      }
    })
    return barrages
  }

  public static streamPathHandle(streamPath: string, timestamp: number) {
    const date = new Date(timestamp)
    const liveDate = `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`
    // window.mainAPI?.openPath?.(this.getFilePath())
    return streamPath.replace(Tools.STREAM_PATH_REGEX, (pathPrefix, protocol, host) => {
      if (host.toLowerCase() !== YI_ZHI_BO_HOST) {
        return pathPrefix
      }

      return `${protocol}://${host}/${liveDate}`
    })
  }

  public static dateFormat(timestamp: number, fmt: string): string {
    const date = new Date(timestamp)
    const o: any = {
      'M+': date.getMonth() + 1, // 月份
      'd+': date.getDate(), // 日
      'h+': date.getHours(), // 小时
      'm+': date.getMinutes(), // 分
      's+': date.getSeconds(), // 秒
      'q+': Math.floor((date.getMonth() + 3) / 3), // 季度
      'S': date.getMilliseconds(), // 毫秒
    }
    // Replace year token (e.g., 'yyyy', 'yy')
    const yearMatch = Tools.YEAR_REGEX.exec(fmt)
    if (yearMatch) {
      const yStr = yearMatch[1]
      fmt = fmt.replace(yStr, `${date.getFullYear()}`.substring(4 - yStr.length))
    }
    // Replace other tokens
    for (const k in o) {
      const regex = Tools.DATE_FORMAT_REGEXES[k]
      const match = regex.exec(fmt)
      if (match) {
        const matchStr = match[1]
        const replacement = matchStr.length === 1
          ? o[k]
          : (`00${o[k]}`).substring(`${o[k]}`.length)
        fmt = fmt.replace(matchStr, replacement)
      }
    }
    return fmt
  }
}

export default Tools
