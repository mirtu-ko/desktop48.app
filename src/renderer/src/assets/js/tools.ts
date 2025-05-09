const YI_ZHI_BO_HOST = 'alcdn.hls.xiaoka.tv'

class Tools {
  public static readonly APP_DATA_PATH: string = '' // Electron环境下需通过主进程或window.electron暴露;

  /**
   * 将逗号分隔的图片路径转换为完整的URL数组
   * @param picturesStr 逗号分隔的图片路径字符串
   * @returns {string[]} 完整的图片URL数组
   */
  public static pictureUrls(picturesStr: string) {
    const pictures = picturesStr.split(',')
    return pictures.map((picture) => {
      if (picture.includes('http')) {
        return picture
      }
      else {
        return `https://source.48.cn${picture}`
      }
    })
  }

  public static sourceUrl(sourcePath: string) {
    if (sourcePath.includes('http://')) {
      return sourcePath
    }
    else {
      return `https://source.48.cn${sourcePath}`
    }
  }

  public static timeToSecond(time: string): number {
    if (!time) {
      return 0
    }
    const hours = time.split(':')[0]
    const minutes = time.split(':')[1]
    const seconds = time.split(':')[2]
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  }

  public static lyricsParse(lyrics: string) {
    if (typeof lyrics === 'undefined') {
      console.error('lyrics undefined')
    }
    const barrages: any[] = []
    const lines = lyrics.split('\n')
    lines.forEach((line: string) => {
      if (typeof line !== 'undefined') {
        const tmp = line.split(']')
        if (typeof tmp !== 'undefined' && tmp.length > 1) {
          const arr = tmp[1].split('\t')
          barrages.push({
            time: tmp[0].replace('[', ''),
            username: arr[0],
            content: arr[1],
          })
        }
      }
    })
    return barrages
  }

  public static streamPathHandle(streamPath: string, timestamp: number) {
    const date = new Date(timestamp)
    const liveDate = `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`
    // window.mainAPI?.showItemInFolder?.(this.getFilePath())
    return streamPath.replace(/^(http|https):\/\/([^/]+)\/(\d+)/, (pathPrefix, protocol, host) => {
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
    const yearMatch = /(y+)/.exec(fmt)
    if (yearMatch) {
      const yStr = yearMatch[1]
      fmt = fmt.replace(yStr, `${date.getFullYear()}`.substring(4 - yStr.length))
    }
    // Replace other tokens
    for (const k in o) {
      const regex = new RegExp(`(${k})`)
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
