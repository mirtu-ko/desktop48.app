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
    Albums: 'albums',
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

  /**
   * 语义主题色：页面/功能主题色的唯一来源（Dock 菜单、任务分组、设置行、
   * app.scss 的 --color-* 变量均与此保持一致），改色只需改这里
   */
  public static readonly Theme = {
    LIVES: '#ff5e7e', // 直播 / 录制：玫红
    SHOWS: '#f59e0b', // 公演：琥珀
    ALBUMS: '#d946ef', // 专辑：品红
    MEMBERS: '#3b82f6', // 成员：蓝
    DOWNLOADS: '#10b981', // 下载：绿
    SETTING: '#6d5ae0', // 设置：品牌紫
  }

  /**
   * 分团切换 tab（公演页 / 成员页左上角浮动切换器共用）：key 即 groupId
   */
  public static readonly GroupTabs: Array<{ label: string, key: string, color: string }> = [
    { label: '全部', key: '0', color: '' },
    { label: 'SNH48', key: '10', color: '#8FD3F6' },
    { label: 'BEJ48', key: '11', color: '#FE2472' },
    { label: 'GNZ48', key: '12', color: '#ABCA14' },
    { label: 'CKG48', key: '14', color: '#FFBA07' },
    { label: 'CGT48', key: '21', color: '#D21217' },
  ]
}
