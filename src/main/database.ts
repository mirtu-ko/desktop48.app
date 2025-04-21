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

    // 为 starInfo 每一项新增 team 字段
    if (Array.isArray(this.db.starInfo) && Array.isArray(this.db.teamInfo)) {
      this.db.starInfo.forEach((member: any) => {
        const team = this.db.teamInfo.find((t: any) => String(t.teamId) === String(member.teamId))
        member.team = team ? { teamColor: team.teamColor, teamName: team.teamName } : { teamColor: '', teamName: '' }
      })
    }

    this.buildMemberTree()
    // 调试打印数据库路径
    console.log('[数据库路径]', this.dbPath)
  }

  public getMember(userId: number) {
    // 通过 userId 查找成员
    return this.db.starInfo.find((m: any) => String(m.userId) === String(userId))
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
    return this.db.hiddenMemberIds || []
  }

  public setHiddenMembers(ids: number[]) {
    this.db.hiddenMemberIds = ids
    this.lowdb.write()
  }

  public getTeam(teamId: number) {
    return (this.teamsDB || []).find((t: any) => String(t.teamId) === String(teamId))
  }

  public hasMembers() {
    return Array.isArray(this.membersDB) && this.membersDB.length > 0
  }

  public saveMemberData(content: any) {
    if (content.starInfo)
      this.db.starInfo = content.starInfo
    if (content.teamInfo)
      this.db.teamInfo = content.teamInfo
    if (content.groupInfo)
      this.db.groupInfo = content.groupInfo
    this.buildMemberTree()
    this.lowdb.write()
    console.log('[main.ts] save-member-data 写入成功:', {
      starInfo: this.db.starInfo?.length,
      teamInfo: this.db.teamInfo?.length,
      groupInfo: this.db.groupInfo?.length,
      memberTree: this.db.memberTree?.length,
    })
    this.lowdb.write()
  }

  public getConfig(key: string, defaultValue: any = null) {
    if (!this.db.config)
      this.db.config = {}
    if (key in this.db.config)
      return this.db.config[key]
    if (key === 'all')
      return this.db.config
    if (key === '')
      return this.db.config
    else
      this.db.config[key] = defaultValue
    this.lowdb.write()
    return defaultValue
  }

  public setConfig(key: string, value: any) {
    if (!this.db.config)
      this.db.config = {}
    this.db.config[key] = value
    this.lowdb.write()
  }
}

// 初始化数据库
Database.instance().init()

// 注册 IPC handler
ipcMain.handle('getMember', async (event, userId) => Database.instance().getMember(userId))
ipcMain.handle('getMemberOptions', async () => Database.instance().getMemberOptions())
ipcMain.handle('getHiddenMembers', async () => Database.instance().getHiddenMembers())
ipcMain.handle('setHiddenMembers', async (event, ids) => Database.instance().setHiddenMembers(ids))
ipcMain.handle('getTeam', async (event, teamId) => Database.instance().getTeam(teamId))
ipcMain.handle('hasMembers', async () => Database.instance().hasMembers())
ipcMain.handle('getConfig', async (event, key, defaultValue) => Database.instance().getConfig(key, defaultValue))
ipcMain.handle('setConfig', async (event, key, value) => Database.instance().setConfig(key, value))
ipcMain.handle('getTeamOptions', async () => Database.instance().getTeamOptions())
ipcMain.handle('getGroupOptions', async () => Database.instance().getGroupOptions())
ipcMain.handle('getMemberTree', async () => Database.instance().db.memberTree)

export { Database }
