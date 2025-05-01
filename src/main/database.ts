import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, ipcMain } from 'electron'
import { LowSync } from 'lowdb'
import { JSONFileSync } from 'lowdb/node'
import data from './data.js'

interface Team {
  teamColor: string
  teamName: string
  label: string
  value: string
}

interface TeamWithMembers {
  teamName: string
  members: any[]
}

interface GroupWithTeams {
  groupName: string
  teams: Map<string, TeamWithMembers>
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
    teamColor: string
  }[]
}

class Database {
  public memberTree: MemberTree[] = []

  private buildMemberTree() {
    // 用 groupName/teamName 字符串分组，保持结构不变
    const groupMap = new Map<string, GroupWithTeams>()
    for (const member of this.db.starInfo || []) {
      const groupName = member.groupName || '未分组'
      const teamName = member.teamName || '未分队'
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, {
          groupName,
          teams: new Map<string, TeamWithMembers>(),
        })
      }
      const group = groupMap.get(groupName)!
      if (!group.teams.has(teamName)) {
        group.teams.set(teamName, {
          teamName,
          members: [],
        })
      }
      group.teams.get(teamName)!.members.push(member)
    }
    // 转换为数组结构，直接存到 this.db.memberTree
    this.memberTree = Array.from(groupMap.values()).map((group: GroupWithTeams) => ({
      groupName: group.groupName,
      teams: Array.from(group.teams.values()).map((team: TeamWithMembers) => ({
        teamColor: '',
        teamName: team.teamName,
        label: team.teamName,
        value: team.teamName,
      })),
      label: group.groupName,
      value: group.groupName,
      children: Array.from(group.teams.values()).map((team: TeamWithMembers) => ({
        label: team.teamName,
        value: team.teamName,
        children: team.members.map((member: any) => ({
          label: member.realName,
          value: member.userId,
          ...member,
        })),
        teamColor: '',
      })),
    }))
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
    // 为 starInfo 每一项新增 team 字段
    if (Array.isArray(this.db.starInfo) && Array.isArray(this.db.teamInfo)) {
      this.db.starInfo.forEach((member: any) => {
        const team = this.db.teamInfo.find((t: any) => Number(t.teamId) === Number(member.teamId))
        member.team = team ? { teamColor: team.teamColor, teamName: team.teamName } : { teamColor: '', teamName: '' }
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
    this.teamsDB = this.db.teamInfo
    this.groupsDB = this.db.groupInfo

    this.buildMemberTree()
    this.memberTeamUpdate()
    this.lowdb.write()
    // 调试打印数据库路径
    console.log('[数据库路径]', this.dbPath)
  }

  public saveMemberData(content: any) {
    // 写入 starInfo 数据
    console.log('[database.ts] save-member-data 开始写入:', content.starInfo?.length, content.teamInfo?.length, content.groupInfo?.length)
    if (content.starInfo)
      this.db.starInfo = content.starInfo
    if (content.teamInfo)
      this.db.teamInfo = content.teamInfo
    if (content.groupInfo)
      this.db.groupInfo = content.groupInfo
    this.buildMemberTree()
    this.memberTeamUpdate()
    this.lowdb.write()
    console.log('[database.ts] save-member-data 写入成功:', {
      starInfo: this.db.starInfo?.length,
      teamInfo: this.db.teamInfo?.length,
      groupInfo: this.db.groupInfo?.length,
      memberTree: this.db.memberTree?.length,
    })
    return { ok: true }
  }

  public getMember(userId: number) {
    // 通过 userId 查找成员
    return this.db.starInfo.find((m: any) => Number(m.userId) === Number(userId))
  }

  public getMemberOptions() {
    // return (this.membersDB || []).map((m: any) => ({ label: m.realName, value: m.userId }))
    return this.db.memberTree
  }

  public getTeamOptions() {
    return (this.teamsDB || []).map((t: any) => ({ label: t.teamName, value: t.teamId }))
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

  public getTeam(teamId: number) {
    return (this.teamsDB || []).find((t: any) => String(t.teamId) === String(teamId))
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
