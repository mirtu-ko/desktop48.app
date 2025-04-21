// ⚠️ 前端不能直接 import 'node:fs' 或 'node:https'。如需文件/网络操作请通过 window.mainAPI 或主进程 IPC 实现。
// import Database removed, use window.mainAPI instead

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

  public static download({ url = '', filePath = '' }) {
    console.log(url, filePath)
    // 请通过 window.mainAPI.downloadTask 实现实际下载
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
      fmt = fmt.replace(yStr, `${date.getFullYear()}`.substr(4 - yStr.length))
    }
    // Replace other tokens
    for (const k in o) {
      const regex = new RegExp(`(${k})`)
      const match = regex.exec(fmt)
      if (match) {
        const matchStr = match[1]
        const replacement = matchStr.length === 1
          ? o[k]
          : (`00${o[k]}`).substr(`${o[k]}`.length)
        fmt = fmt.replace(matchStr, replacement)
      }
    }
    return fmt
  }

  /**
   * ffplay路径
   */
  /**
   * ffplay路径（仅渲染进程可用）
   */
  public static async ffplayPath(): Promise<string> {
    if (typeof window === 'undefined' || !window.mainAPI) {
      throw new Error('Tools.ffplayPath()只能在渲染进程中调用')
    }
    return await this.ffmpegToolsPath('ffplay')
  }

  /**
   * ffmpeg路径（仅渲染进程可用）
   */
  public static async ffmpegPath(): Promise<string> {
    if (typeof window === 'undefined' || !window.mainAPI) {
      throw new Error('Tools.ffmpegPath()只能在渲染进程中调用')
    }
    return await this.ffmpegToolsPath('ffmpeg')
  }

  /**
   * 获取执行文件全称（仅渲染进程可用）
   * @param filename
   */
  public static ffmpegFullFilename(filename: string): string {
    if (typeof window === 'undefined' || !window.mainAPI) {
      throw new Error('Tools.ffmpegFullFilename()只能在渲染进程中调用')
    }
    // 若 getPlatform 返回 Promise，需要同步处理或报错。此处假定 getPlatform 已同步返回 string。
    const platform = window.mainAPI.getPlatform()
    if (typeof platform !== 'string') {
      // 容错处理，防止 platform 为 Promise
      return `${filename}.exe`
    }
    switch (platform) {
      case 'darwin':
        return filename
      case 'win32':
      default:
        return `${filename}.exe`
    }
  }

  public static setFfmpegExecutable() {
    try {
      // fs.chmodSync(Tools.ffmpegPath(), '777');
      // fs.chmodSync(Tools.ffplayPath(), '777');
    }
    catch (e) {
      console.error(e)
    }
  }

  /**
   * ffmpeg|ffplay路径（仅渲染进程可用）
   * @param executeFilename
   */
  private static async ffmpegToolsPath(executeFilename: string): Promise<string> {
    if (typeof window === 'undefined' || !window.mainAPI) {
      throw new Error('Tools.ffmpegToolsPath()只能在渲染进程中调用')
    }
    const dir = await window.mainAPI.getConfig('ffmpegDirctory')
    return `${dir}/${this.ffmpegFullFilename(executeFilename)}`
  }
}

export default Tools
