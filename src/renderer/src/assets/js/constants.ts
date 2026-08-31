export default class Constants {
  /**
   * 默认User-Agent
   */
  public static readonly DEFAULT_USER_AGENT: string = 'Mozilla/5.0 (Linux; U; Android 8.1.0;) AppleWebKit/537.36 (KHTML, like Gecko)'

  /**
   * 菜单
   */
  public static readonly Menu: any = {
    LIVES: 'lives',
    SETTING: 'setting',
    DOWNLOADS: 'downloads',
    Shows: 'shows',
    Members: 'members',
  }

  /**
   * 任务状态（下载/录制共用）
   */
  public static readonly TaskStatus = {
    Prepared: 0,
    Running: 1,
    Finish: 2,
  }
}
