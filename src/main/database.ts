import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, ipcMain } from 'electron'
import { LowSync } from 'lowdb'
import { JSONFileSync } from 'lowdb/node'
import data from './data'
import { log } from './logger'

interface Team {
  label: string
  value: string
}

interface MemberTree {
  groupName: string
  teams: Team[]
  label: string
  value: string
  children: {
    label: string
    value: string
    children: {
      label: string
      value: string
      [key: string]: any
    }[]
  }[]
}

class Database {
  public memberTree: MemberTree[] = []

  private buildMemberTree() {
    // 用 groupName/teamName 字符串分组，保持树状层级；同时记录 groupId / teamId 供回放筛选使用
    const groupMap = new Map<string, { groupId: number, groupName: string, teams: Map<string, { teamId: number, teamName: string, members: any[] }> }>()
    for (const member of this.db.starInfo || []) {
      const groupName = member.groupName || '未分组'
      const teamName = member.teamName || '未分队'
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, { groupId: member.groupId, groupName, teams: new Map() })
      }
      const group = groupMap.get(groupName)!
      group.groupId ??= member.groupId
      if (!group.teams.has(teamName)) {
        group.teams.set(teamName, { teamId: member.teamId, teamName, members: [] })
      }
      const team = group.teams.get(teamName)!
      team.teamId ??= member.teamId
      team.members.push(member)
    }

    // 排序权重：按 groupSort / teamSort；查不到的排到末尾
    const groupSortOf = (groupId: number) => {
      const g = this.db.groupInfo?.find((i: any) => Number(i.groupId) === Number(groupId))
      return g?.groupSort ?? Number.MAX_SAFE_INTEGER
    }
    const teamSortOf = (groupId: number, teamId: number) => {
      const t = this.db.teamInfo?.find(
        (i: any) => Number(i.groupId) === Number(groupId) && Number(i.teamId) === Number(teamId),
      )
      return t?.teamSort ?? Number.MAX_SAFE_INTEGER
    }
    const teamBadgeOf = (teamId: number) => {
      const t = this.db.teamInfo?.find((i: any) => Number(i.teamId) === Number(teamId))
      return t?.seineTeamBadge || ''
    }

    // 转换为数组结构，直接存到 this.db.memberTree；group/team/member 的 value 用 id 字符串，便于回放按维度筛选
    this.memberTree = [...groupMap.values()]
      .sort((a, b) => groupSortOf(a.groupId) - groupSortOf(b.groupId))
      .map((group) => {
        const teamNodes = [...group.teams.values()]
          .sort((a, b) => teamSortOf(group.groupId, a.teamId) - teamSortOf(group.groupId, b.teamId))
          .map(team => ({
            teamName: team.teamName,
            label: team.teamName,
            value: String(team.teamId),
            // 队伍徽章（seineTeamBadge，可能是相对路径，渲染端负责归一化），供成员页分组标题展示
            teamBadge: teamBadgeOf(team.teamId),
            children: team.members.map((member: any) => ({
              label: member.realName,
              value: String(member.userId),
              ...member,
            })),
          }))
        return {
          groupName: group.groupName,
          groupId: group.groupId,
          label: group.groupName,
          value: String(group.groupId),
          teams: teamNodes.map(({ teamName, label, value }: any) => ({ teamName, label, value })),
          children: teamNodes,
        }
      })
    this.db.memberTree = this.memberTree
  }

  public static instance() {
    return this.database
  }

  private static database: Database = new Database()
  private dbPath: string
  private adapter: JSONFileSync<any>
  private lowdb: LowSync<any>
  public db: any
  public membersDB: any
  public teamsDB: any
  public groupsDB: any

  private constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = join(userDataPath, 'database.json')
    if (!existsSync(dirname(this.dbPath))) {
      mkdirSync(dirname(this.dbPath), { recursive: true })
    }
    this.adapter = new JSONFileSync(this.dbPath)
    this.lowdb = new LowSync(this.adapter, data) // 传递默认数据，避免 data 未初始化
  }

  private memberTeamUpdate() {
    // 为 starInfo 每一项补 teamColor；查不到队伍时保留旧值（粘性），
    // 保证解散队伍被清洗后，退团成员仍保留最后一次已知的队伍颜色（颜色随成员持久化）
    if (Array.isArray(this.db.starInfo) && Array.isArray(this.db.teamInfo)) {
      this.db.starInfo.forEach((member: any) => {
        const team = this.db.teamInfo.find((t: any) => Number(t.teamId) === Number(member.teamId))
        member.teamColor = team?.teamColor || member.teamColor || ''
      })
    }
  }

  private pruneTeamsAndGroups() {
    // 清洗 teamInfo/groupInfo：存活 = 被在团/暂休成员引用（status !== 3，含旧数据缺 status 的兜底）
    // 或 API 标记 status === 1；两者都说死才删除，任一信号存活即保留（防 API 误标/缺字段）
    if (!Array.isArray(this.db.starInfo) || !Array.isArray(this.db.teamInfo) || !Array.isArray(this.db.groupInfo)) {
      return
    }
    const activeTeamIds = new Set(
      this.db.starInfo.filter((m: any) => m.status !== 3).map((m: any) => Number(m.teamId)),
    )
    this.db.teamInfo = this.db.teamInfo.filter(
      (t: any) => t.status === 1 || activeTeamIds.has(Number(t.teamId)),
    )
    const activeGroupIds = new Set(
      this.db.starInfo.filter((m: any) => m.status !== 3).map((m: any) => Number(m.groupId)),
    )
    this.db.groupInfo = this.db.groupInfo.filter(
      (g: any) => g.status === 1 || activeGroupIds.has(Number(g.groupId)),
    )
    this.teamsDB = this.db.teamInfo
    this.groupsDB = this.db.groupInfo
  }

  public init() {
    this.lowdb.read()
    if (!this.lowdb.data) {
      this.lowdb.data = data
      this.lowdb.write()
    }
    this.db = this.lowdb.data
    this.membersDB = this.db.starInfo

    // 迁移旧存储字段：hiddenMemberIds → blockedMemberIds（一次性，读到旧键即搬运并删除）
    if (this.db.blockedMemberIds === undefined && this.db.hiddenMemberIds !== undefined) {
      this.db.blockedMemberIds = this.db.hiddenMemberIds
      delete this.db.hiddenMemberIds
    }

    // 统一顺序：先补颜色（粘性留存）→ 再清洗（解散队伍移除）→ 再建树（树的孩子是 spread 拷贝，最后建才能带上 teamColor）
    this.memberTeamUpdate()
    this.pruneTeamsAndGroups()
    this.buildMemberTree()
    this.lowdb.write()
    // 调试打印数据库路径
    log('[database.ts]数据库路径', this.dbPath)
  }

  public saveMemberData(content: any) {
    // 写入 starInfo 数据
    log('[database.ts] save-member-data 开始写入:', content.starInfo?.length, content.teamInfo?.length, content.groupInfo?.length)
    if (content.starInfo)
      this.db.starInfo = content.starInfo
    if (content.teamInfo)
      this.db.teamInfo = content.teamInfo
    if (content.groupInfo)
      this.db.groupInfo = content.groupInfo
    log('[database.ts] save-member-data 写入成功:', {
      starInfo: this.db.starInfo?.length,
      teamInfo: this.db.teamInfo?.length,
      groupInfo: this.db.groupInfo?.length,
      memberTree: this.db.memberTree?.length,
    })
    // 同步缓存引用：starInfo 是整组替换，不刷新的话 hasMembers 等会读到旧数据直到重启
    this.membersDB = this.db.starInfo
    // 统一顺序：先补颜色（粘性留存）→ 再清洗（解散队伍移除）→ 再建树（最后建才能带上 teamColor）
    this.memberTeamUpdate()
    this.pruneTeamsAndGroups()
    this.buildMemberTree()
    // 写入数据库
    this.lowdb.write()
    return { ok: true }
  }

  public getMember(userId: number) {
    // 通过 userId 查找成员
    return this.db.starInfo.find((m: any) => Number(m.userId) === Number(userId))
  }

  public getTeamOptions() {
    // 拼接 groupName-teamName 作为 label，不修改原始数据，避免重复调用导致名字叠加
    return (this.teamsDB || []).map((t: any) => {
      const group = this.db.groupInfo.find((g: any) => Number(g.groupId) === Number(t.groupId))
      const label = `${group?.groupName || ''}-${t.teamName || ''}`
      return { label, value: t.teamId }
    })
  }

  public getGroupOptions() {
    return (this.groupsDB || []).map((g: any) => ({ label: g.groupName, value: g.groupId }))
  }

  public getBlockedMembers() {
    // 确保 blockedMemberIds 存在且为数组
    if (!this.db.blockedMemberIds) {
      this.db.blockedMemberIds = []
      this.lowdb.write()
    }

    // 确保 starInfo 存在
    if (!this.db.starInfo) {
      return []
    }

    const blockedMembers = this.db.blockedMemberIds.map(id =>
      this.db.starInfo.find((m: any) => Number(m.userId) === Number(id)),
    )

    // 过滤掉可能的 undefined 结果
    return blockedMembers.filter(member => member !== undefined)
  }

  public setBlockedMembers(ids: number[]) {
    this.db.blockedMemberIds = ids
    this.lowdb.write()
  }

  public addBlockedMember(userId: number) {
    this.ensureBlockedMemberIds()
    // Number 归一化：历史数据里存的可能级联选择器的字符串 id，严格比较会判重失败
    const exists = this.db.blockedMemberIds.some(
      (id: number | string) => Number(id) === Number(userId),
    )
    if (!exists) {
      this.db.blockedMemberIds.push(userId)
      this.lowdb.write()
    }
  }

  public removeBlockedMember(userId: number) {
    this.ensureBlockedMemberIds()
    // Number 归一化：历史数据里存的可能级联选择器的字符串 id，严格比较会删不掉
    this.db.blockedMemberIds = this.db.blockedMemberIds.filter(
      (id: number | string) => Number(id) !== Number(userId),
    )
    this.lowdb.write()
  }

  /** 兜底：老库缺 blockedMemberIds 字段时初始化为空数组 */
  private ensureBlockedMemberIds() {
    if (!Array.isArray(this.db.blockedMemberIds)) {
      this.db.blockedMemberIds = []
    }
  }

  public hasMembers() {
    return Array.isArray(this.membersDB) && this.membersDB.length > 0
  }

  public getConfig(key: string, defaultValue: any = null) {
    if (!this.db.config)
      this.db.config = {}
    if (key !== 'downloadDirectory' && key !== 'ffmpegDirectory' && key !== 'userAgent' && key !== 'all')
      throw new Error('Invalid config key')
    if (key in this.db.config)
      return this.db.config[key]
    if (key === 'all')
      return this.db.config
    else
      this.db.config[key] = defaultValue
    this.lowdb.write()
    return defaultValue
  }

  public setConfig(key: string, value: any) {
    if (!this.db.config)
      this.db.config = {}
    if (key !== 'downloadDirectory' && key !== 'ffmpegDirectory' && key !== 'userAgent' && key !== 'all')
      throw new Error('Invalid config key')
    this.db.config[key] = value
    this.lowdb.write()
  }
}

// 初始化数据库
Database.instance().init()

// 注册 IPC handler
ipcMain.handle('saveMemberData', async (_event, content) => Database.instance().saveMemberData(content))
ipcMain.handle('getMember', async (_event, userId) => Database.instance().getMember(userId))
ipcMain.handle('getBlockedMembers', async () => Database.instance().getBlockedMembers())
ipcMain.handle('setBlockedMembers', async (_event, ids) => Database.instance().setBlockedMembers(ids))
ipcMain.handle('addBlockedMember', async (_event, userId) => Database.instance().addBlockedMember(userId))
ipcMain.handle('removeBlockedMember', async (_event, userId) => Database.instance().removeBlockedMember(userId))
ipcMain.handle('hasMembers', async () => Database.instance().hasMembers())
ipcMain.handle('getConfig', async (_event, key, defaultValue?: any) => Database.instance().getConfig(key, defaultValue))
ipcMain.handle('setConfig', async (_event, key, value) => Database.instance().setConfig(key, value))
ipcMain.handle('getTeamOptions', async () => Database.instance().getTeamOptions())
ipcMain.handle('getGroupOptions', async () => Database.instance().getGroupOptions())
ipcMain.handle('getMemberTree', async () => Database.instance().db.memberTree)

export { Database }
