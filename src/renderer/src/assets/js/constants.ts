export default class Constants {
  public static readonly MAX_BARRAGE_LENGTH = 50

  /**
   * 初始化状态
   */
  public static readonly INITIAL_STATUS_DOWNLOADING: string = 'DOWNLOADING'
  public static readonly INITIAL_STATUS_UNZIPPING: string = 'UNZIPPING'
  public static readonly INITIAL_STATUS_FINISHED: string = 'FINISHED'

  /**
   * 回放筛选
   */
  public static readonly REVIEW_SCREEN: any = {
    USER: 'USER',
    TEAM: 'TEAM',
    GROUP: 'GROUP',
  }

  /**
   * 默认User-Agent
   */
  public static readonly DEFAULT_USER_AGENT: string = 'Mozilla/5.0 (Linux; U; Android 8.1.0;) AppleWebKit/537.36 (KHTML, like Gecko)'

  /**
   * 菜单
   */
  public static readonly Menu: any = {
    LIVES: 'lives',
    REVIEWS: 'reviews',
    SETTING: 'setting',
    DOWNLOADS: 'downloads',
    Shows: 'shows',
  }

  /**
   * 播放状态
   */
  public static readonly STATUS_PLAYING = 1
  public static readonly STATUS_PREPARED = 0

  /**
   * 列表列数
   */
  public static readonly LIST_COL = 8
  public static readonly LIST_SPAN_TOTAL = 24

  /**
   * event
   */
  public static readonly Event = {
    'download-task': 'download-task',
    'record-task': 'record-task',
    'change-selected-menu': 'change-selected-menu',
  }

  /**
   * 下载状态
   */
  public static readonly DownloadStatus = {
    Prepared: 0,
    Downloading: 1,
    Finish: 2,
  }

  /**
   * 录制状态
   */
  public static readonly RecordStatus = {
    Prepared: 0,
    Recording: 1,
    Finish: 2,
  }

  /**
   * 默认下载目录
   */
  public static readonly DEFAULT_DOWNLOAD_DIR = (typeof process !== 'undefined' && process.type === 'renderer')
    ? window.mainAPI?.getDesktopPath?.()
    : ''

  /**
   * 最大下载任务数
   */
  public static readonly MAX_DOWNLOAD_TASK = 3

  public static readonly MIN_SHOWN_LINE_COUNT = 3

  /**
   * 未知成员
   */
  public static readonly UNKNOWN_MEMBER = {
    teamName: 'unknown',
    birthday: '01-01',
    specialty: '',
    groupId: 10,
    periodName: '',
    bloodType: '',
    constellation: '',
    nickname: '',
    ctime: 1553661473202,
    abbr: '',
    height: '',
    periodId: 0,
    starRegion: '',
    joinTime: '',
    utime: 1553661473202,
    fullPhoto4: '',
    avatar: '',
    fullPhoto3: '',
    wbName: '',
    userId: 0,
    realName: 'unknown',
    groupName: 'SNH48',
    pinyin: 'unknown',
    birthplace: 'unknown',
    fullPhoto2: '',
    hobbies: '',
    fullPhoto1: '',
    teamId: 1001,
    wbUid: '',
    status: 1,
  }
}
