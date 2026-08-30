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
    // 为 starInfo 每一项新增 teamColor 字段
    if (Array.isArray(this.db.starInfo) && Array.isArray(this.db.teamInfo)) {
      this.db.starInfo.forEach((member: any) => {
        const team = this.db.teamInfo.find((t: any) => Number(t.teamId) === Number(member.teamId))
        member.teamColor = team?.teamColor || ''
      })
    }
  }

  public init() {
    this.lowdb.read()
    if (!this.lowdb.data) {
      this.lowdb.data = data
      this.lowdb.write()
    }
    this.db = this.lowdb.data
    this.membersDB = this.db.starInfo
    // 统计starInfo里所有成员的teamId，并排重。如果teamInfo里的teamId不在starInfo里，就删除
    const teamIds = Array.from(new Set(this.db.starInfo.map((m: any) => m.teamId)))
    this.db.teamInfo = this.db.teamInfo.filter((t: any) => teamIds.includes(t.teamId))
    this.teamsDB = this.db.teamInfo
    // 统计starInfo里所有成员的groupId，并排重。如果groupInfo里的groupId不在starInfo里，就删除
    const groupIds = Array.from(new Set(this.db.starInfo.map((m: any) => m.groupId)))
    this.db.groupInfo = this.db.groupInfo.filter((g: any) => groupIds.includes(g.groupId))
    this.groupsDB = this.db.groupInfo

    this.buildMemberTree()
    this.memberTeamUpdate()
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
    // 更新 memberTree
    this.buildMemberTree()
    this.memberTeamUpdate()
    // 写入数据库
    this.lowdb.write()
    return { ok: true }
  }

  public getMember(userId: number) {
    // 通过 userId 查找成员
    return this.db.starInfo.find((m: any) => Number(m.userId) === Number(userId))
  }

  public getMemberOptions() {
    return this.db.memberTree
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

  public getHiddenMembers() {
    // 确保 hiddenMemberIds 存在且为数组
    if (!this.db.hiddenMemberIds) {
      this.db.hiddenMemberIds = []
      this.lowdb.write()
    }

    // 确保 starInfo 存在
    if (!this.db.starInfo) {
      return []
    }

    const hiddenMembers = this.db.hiddenMemberIds.map(id =>
      this.db.starInfo.find((m: any) => Number(m.userId) === Number(id)),
    )

    // 过滤掉可能的 undefined 结果
    return hiddenMembers.filter(member => member !== undefined)
  }

  public setHiddenMembers(ids: number[]) {
    this.db.hiddenMemberIds = ids
    this.lowdb.write()
  }

  public removeHiddenMember(userId: number) {
    this.db.hiddenMemberIds = this.db.hiddenMemberIds.filter((id: number) => id !== userId)
    this.lowdb.write()
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
ipcMain.handle('getMemberOptions', async () => Database.instance().getMemberOptions())
ipcMain.handle('getHiddenMembers', async () => Database.instance().getHiddenMembers())
ipcMain.handle('setHiddenMembers', async (_event, ids) => Database.instance().setHiddenMembers(ids))
ipcMain.handle('removeHiddenMember', async (_event, userId) => Database.instance().removeHiddenMember(userId))
ipcMain.handle('hasMembers', async () => Database.instance().hasMembers())
ipcMain.handle('getConfig', async (_event, key, defaultValue?: any) => Database.instance().getConfig(key, defaultValue))
ipcMain.handle('setConfig', async (_event, key, value) => Database.instance().setConfig(key, value))
ipcMain.handle('getTeamOptions', async () => Database.instance().getTeamOptions())
ipcMain.handle('getGroupOptions', async () => Database.instance().getGroupOptions())
ipcMain.handle('getMemberTree', async () => Database.instance().db.memberTree)

export { Database }
