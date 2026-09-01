<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref } from 'vue'

/** 被屏蔽成员：主进程从 starInfo 中按 userId 挑出的成员对象 */
interface BlockedMember {
  userId: number
  realName: string
  teamColor: string
  [key: string]: any
}

/** 成员级联树节点：分组/队伍/成员三层，成员层带拼音与缩写检索字段 */
interface MemberTreeNode {
  label: string
  value: string
  text?: string
  pinyin?: string
  abbr?: string
  children?: MemberTreeNode[]
}

const emit = defineEmits<{ change: [count: number] }>()

// 成员级联选项（分组 → 队伍 → 成员）
const members = ref<MemberTreeNode[]>([])
const selectedMember = ref<string[]>([])

// 屏蔽名单
const blockedMembers = ref<BlockedMember[]>([])

const whitespaceRegex = /\s+/g

// 成员支持拼音/首字母/缩写检索，与回放筛选保持一致
function filterMethod(node: any, keyword: string) {
  const label = node.text || node.label
  const pinyin = node.data?.pinyin?.replace(whitespaceRegex, '') || ''
  const abbr = node.data?.abbr?.replace(whitespaceRegex, '') || ''
  const searchText = keyword.toLowerCase()
  return (
    (label && label.toLowerCase().includes(searchText))
    || (pinyin && pinyin.toLowerCase().includes(searchText))
    || (abbr && abbr.toLowerCase().includes(searchText))
  )
}

async function refreshBlockedMembers() {
  blockedMembers.value = await window.mainAPI.getBlockedMembers()
  emit('change', blockedMembers.value.length)
}

async function blockSelectedMember() {
  // 级联值为 [groupId, teamId, userId] 路径，成员 id 取末位（不依赖固定层级深度）
  const memberId = Number(selectedMember.value.at(-1))
  if (!memberId) {
    ElMessage({ message: '请选中需要屏蔽的成员', type: 'warning' })
    return
  }
  if (blockedMembers.value.some(member => Number(member.userId) === memberId)) {
    ElMessage({ message: '请勿重复添加', type: 'warning' })
    return
  }
  await window.mainAPI.addBlockedMember(memberId)
  selectedMember.value = []
  await refreshBlockedMembers()
}

async function unblockMember(userId: number) {
  await window.mainAPI.removeBlockedMember(userId)
  await refreshBlockedMembers()
}

async function clearAll() {
  try {
    await ElMessageBox.confirm(`确定清空全部 ${blockedMembers.value.length} 个屏蔽成员？`, '清空屏蔽名单', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消',
    })
  }
  catch {
    return // 用户取消
  }
  await window.mainAPI.setBlockedMembers([])
  await refreshBlockedMembers()
  ElMessage({ message: '已清空屏蔽名单', type: 'success' })
}

onMounted(async () => {
  members.value = (await window.mainAPI.getMemberOptions()) as MemberTreeNode[]
  await refreshBlockedMembers()
})
</script>

<template>
  <div class="blocked-members">
    <div class="picker-row">
      <el-cascader
        v-model="selectedMember"
        class="member-cascader"
        :options="members"
        placeholder="搜索并选择成员"
        clearable
        filterable
        :filter-method="filterMethod"
      />
      <el-button
        type="primary"
        :disabled="!selectedMember.length"
        @click="blockSelectedMember"
      >
        屏蔽
      </el-button>
      <el-button
        type="danger"
        plain
        :disabled="!blockedMembers.length"
        @click="clearAll"
      >
        清空
      </el-button>
    </div>

    <div
      v-if="blockedMembers.length"
      class="tag-list"
    >
      <el-tag
        v-for="member in blockedMembers"
        :key="member.userId"
        closable
        :color="`#${member.teamColor}`"
        effect="dark"
        @close="unblockMember(member.userId)"
      >
        {{ member.realName }}
      </el-tag>
    </div>
    <div
      v-else
      class="empty-hint"
    >
      尚未屏蔽任何成员，屏蔽后其直播与回放将从列表中隐藏
    </div>
  </div>
</template>

<style scoped lang="scss">
.picker-row {
  display: flex;
  align-items: center;
  gap: 10px;

  .member-cascader {
    flex: 1;
    min-width: 240px;
    max-width: 420px;
  }
}

/* 队伍色标签：白字 + 半透明白描边（:color 内联样式优先级高，需 !important 覆盖） */
.tag-list {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  :deep(.el-tag) {
    color: #fff !important;
    border-color: rgba(255, 255, 255, 0.45) !important;

    .el-tag__close {
      color: #fff;

      &:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.3);
      }
    }
  }
}

.empty-hint {
  padding: 10px 0 2px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
