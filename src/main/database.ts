import type { MemberRecord, MemberTreeGroupNode } from './domain/member-tree'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { LowSync } from 'lowdb'
import data from './data'
import { addBlockedMemberId, isBlockedId, removeBlockedId, resolveBlockedMembers } from './domain/blocked-members'
import { buildMemberTree } from './domain/member-tree'
import { log } from './logger'
import { SafeJSONFileSync } from './safe-json-file-sync'

/** config 里允许存取的键；'all' 表示整包读取 */
const CONFIG_KEYS = new Set(['downloadDirectory', 'ffmpegDirectory', 'userAgent', 'all'])

function assertConfigKey(key: string) {
  if (!CONFIG_KEYS.has(key))
    throw new Error('Invalid config key')
}

/**
 * lowdb 数据库门面：负责原子读写、config CRUD 与成员/屏蔽名单查询。
 *
 * 职责边界（M3 拆分后）：
 * - 建树逻辑在 `domain/member-tree.ts`（纯函数）
 * - 屏蔽名单的匹配/过滤在 `domain/blocked-members.ts`（纯函数），本类只管落库
 * - IPC 注册在 `ipc/register-database-ipc.ts`
 *
 * 模块导入无副作用：单例懒创建（首次 instance() 时构造），init() 由 app.ts 显式调用。
 * dbPath 支持注入，便于脱离 Electron 做测试。
 */
class Database {
  /** 成员树：starInfo 的内存派生（不落盘），见 domain/member-tree.ts */
  public memberTree: MemberTreeGroupNode[] = []
  public db: any
  public membersDB: MemberRecord[] | undefined

  private static database: Database | null = null

  private adapter: SafeJSONFileSync<any>
  private lowdb: LowSync<any>
  private readonly dbPath: string

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? join(app.getPath('userData'), 'database.json')
    this.adapter = new SafeJSONFileSync(this.dbPath)
    this.lowdb = new LowSync(this.adapter, data)
  }

  public static instance() {
    this.database ??= new Database()
    return this.database
  }

  public init() {
    if (!existsSync(dirname(this.dbPath))) {
      mkdirSync(dirname(this.dbPath), { recursive: true })
    }
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

    // 清理旧库遗留的派生字段：memberTree 现在是纯内存派生，不再持久化
    delete this.db.memberTree

    // 建树（纯内存派生，不写回原始数据）
    this.rebuildMemberTree()
    this.lowdb.write()
    log('[database.ts]数据库路径', this.dbPath)
  }

  /** 保存 API 同步来的成员原始数据；清洗/派生只发生在内存里（建树），落盘的只有原始内容 */
  public saveMemberData(content: any) {
    log('[database.ts] save-member-data 开始写入:', content.starInfo?.length, content.teamInfo?.length, content.groupInfo?.length)
    if (content.starInfo)
      this.db.starInfo = content.starInfo
    if (content.teamInfo)
      this.db.teamInfo = content.teamInfo
    if (content.groupInfo)
      this.db.groupInfo = content.groupInfo
    log('[database.ts] save-member-data 原始数据写入成功:', {
      starInfo: this.db.starInfo?.length,
      teamInfo: this.db.teamInfo?.length,
      groupInfo: this.db.groupInfo?.length,
    })
    // 同步缓存引用：starInfo 是整组替换，不刷新的话 hasMembers 等会读到旧数据直到重启
    this.membersDB = this.db.starInfo
    this.rebuildMemberTree()
    this.lowdb.write()
    return { ok: true }
  }

  public getMember(userId: number) {
    return this.db.starInfo.find((m: MemberRecord) => Number(m.userId) === Number(userId))
  }

  public getBlockedMembers() {
    // 确保 blockedMemberIds 存在且为数组
    if (!this.db.blockedMemberIds) {
      this.db.blockedMemberIds = []
      this.lowdb.write()
    }
    return resolveBlockedMembers(this.db.blockedMemberIds, this.db.starInfo)
  }

  public setBlockedMembers(ids: number[]) {
    this.db.blockedMemberIds = ids
    this.lowdb.write()
  }

  public addBlockedMember(userId: number) {
    const changed = addBlockedMemberId(this.db.blockedMemberIds, userId)
    if (changed) {
      this.db.blockedMemberIds = changed
      this.lowdb.write()
    }
  }

  public removeBlockedMember(userId: number) {
    this.db.blockedMemberIds = removeBlockedId(this.db.blockedMemberIds || [], userId)
    this.lowdb.write()
  }

  /** 名单判重的纯函数封装（供内部与其他模块复用） */
  public isBlocked(userId: number) {
    return isBlockedId(this.db.blockedMemberIds || [], userId)
  }

  public hasMembers() {
    return Array.isArray(this.membersDB) && this.membersDB.length > 0
  }

  public getConfig(key: string, defaultValue: any = null) {
    assertConfigKey(key)
    if (!this.db.config)
      this.db.config = {}
    if (key in this.db.config)
      return this.db.config[key]
    if (key === 'all')
      return this.db.config
    this.db.config[key] = defaultValue
    this.lowdb.write()
    return defaultValue
  }

  public setConfig(key: string, value: any) {
    assertConfigKey(key)
    if (!this.db.config)
      this.db.config = {}
    this.db.config[key] = value
    this.lowdb.write()
  }

  /** 重建内存派生的成员树 */
  private rebuildMemberTree() {
    this.memberTree = buildMemberTree(this.db.starInfo, this.db.teamInfo, this.db.groupInfo)
  }
}

export { Database }
