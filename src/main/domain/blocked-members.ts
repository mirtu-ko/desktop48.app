/**
 * 屏蔽名单的纯函数集合：id 归一化匹配、从成员表解析屏蔽成员。
 *
 * 变更落库（写 db）留在 Database 类里；本模块只做无副作用的计算与过滤，
 * 输入输出都是普通数据，可直接单测。
 */
import type { MemberRecord } from './member-tree'

/**
 * 判断 userId 是否已在名单里。Number 归一化：历史数据里存的可能
 * 是级联选择器的字符串 id，严格比较会判重失败/删不掉
 */
export function isBlockedId(blockedIds: Array<number | string>, userId: number): boolean {
  return blockedIds.some(id => Number(id) === Number(userId))
}

/** 向名单添加 userId（幂等）。已存在时返回 null 表示无需落库，否则返回新数组（不改动入参） */
export function addBlockedMemberId(
  blockedIds: Array<number | string> | undefined,
  userId: number,
): Array<number | string> | null {
  const list = blockedIds || []
  if (isBlockedId(list, userId))
    return null
  return [...list, userId]
}

/** 从名单里移除 userId，返回新数组（不改动入参）；名单未初始化视为空 */
export function removeBlockedId(
  blockedIds: Array<number | string> | undefined,
  userId: number,
): Array<number | string> {
  return (blockedIds || []).filter(id => Number(id) !== Number(userId))
}

/**
 * 按名单解析屏蔽成员详情：名单里查不到的 id（成员已退团等）静默跳过。
 * 成员数据未初始化时视为无屏蔽。
 */
export function resolveBlockedMembers(
  blockedIds: Array<number | string> | undefined,
  starInfo: MemberRecord[] | undefined,
): MemberRecord[] {
  if (!starInfo)
    return []
  return (blockedIds || [])
    .map(id => starInfo.find(m => Number(m.userId) === Number(id)))
    .filter((member): member is MemberRecord => member !== undefined)
}
