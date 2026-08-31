<script setup lang="ts">
import type { MemberDetail } from './MemberDetailDrawer.vue'
import { Refresh, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import Apis from '../assets/js/apis'
import Tools from '../assets/js/tools'
import FloatingDock from './FloatingDock.vue'
import FloatingTabBar from './FloatingTabBar.vue'
import MemberDetailDrawer from './MemberDetailDrawer.vue'

/** 成员树：分团 → 队伍 → 成员（getMemberTree 返回结构） */
interface TeamNode {
  teamName: string
  /** 队伍徽章（seineTeamBadge，可能是相对路径，展示前需归一化） */
  teamBadge?: string
  children: MemberDetail[]
}

interface GroupNode {
  groupName: string
  groupId: number
  children: TeamNode[]
}

const loading = ref(true)
const groups = ref<GroupNode[]>([])

/** 当前分团 groupId：0=全部 10=SNH 11=BEJ 12=GNZ 13=CKG 14=CGT */
const groupId = ref('0')

/** 左上角分团切换 tab 选项（与公演页一致的主题色） */
const groupTabs = [
  { label: '全部', key: '0', color: '' },
  { label: 'SNH48', key: '10', color: '#8FD3F6' },
  { label: 'BEJ48', key: '11', color: '#FE2472' },
  { label: 'GNZ48', key: '12', color: '#ABCA14' },
  { label: 'CKG48', key: '14', color: '#FFBA07' },
  { label: 'CGT48', key: '21', color: '#D21217' },
]

/** 成员状态（starInfo.status）：1 正常 2 暂休 3 退团 */
const STATUS_ACTIVE = 1
const STATUS_HIATUS = 2
const STATUS_LEFT = 3

/** 展示分节 */
interface MemberSection {
  title: string
  teamBadge: string
  members: MemberDetail[]
}

/** 头像相对路径归一化 */
function normalizeMember(member: MemberDetail): MemberDetail {
  return { ...member, avatar: member.avatar ? Tools.sourceUrl(member.avatar) : '' }
}

/** 徽章加载失败时隐藏，避免显示碎图 */
function hideBadge(event: Event) {
  (event.target as HTMLImageElement).style.visibility = 'hidden'
}

/** 当前查看详情的成员（null = 抽屉关闭） */
const selectedMember = ref<MemberDetail | null>(null)

/** API 把“明星殿堂”建模成独立分团（groupId 19），展示上并入 SNH48 的同名队伍（teamId 1008） */
const HALL_GROUP_NAME = '明星殿堂'
const HALL_HOST_GROUP_NAME = 'SNH48'

/** 展示分节：分团队伍只收在团成员（status=1），末尾追加 暂休（status=2）/ 退团（status=3），均受分团筛选影响 */
const sections = computed<MemberSection[]>(() => {
  const hall = groups.value.find(group => group.groupName === HALL_GROUP_NAME)
  // 纯展示层合并：不改原树，避免副作用（回放筛选、隐藏成员仍用原结构）
  const merged = groups.value
    .filter(group => group.groupName !== HALL_GROUP_NAME)
    .map((group) => {
      if (!hall || group.groupName !== HALL_HOST_GROUP_NAME) {
        return group
      }
      const children = [...group.children]
      for (const team of hall.children) {
        const index = children.findIndex(item => item.teamName === team.teamName)
        if (index >= 0) {
          children[index] = {
            ...children[index],
            children: [...children[index].children, ...team.children],
          }
        }
        else {
          children.push(team)
        }
      }
      return { ...group, children }
    })

  const list = merged.filter(
    group => groupId.value === '0' || String(group.groupId) === groupId.value,
  )
  const collect = (status: number) =>
    list.flatMap(group =>
      group.children.flatMap(team =>
        team.children.filter(member => member.status === status).map(normalizeMember),
      ),
    )

  const result: MemberSection[] = []
  for (const group of list) {
    for (const team of group.children) {
      const members = team.children
        .filter(member => member.status === STATUS_ACTIVE)
        .map(normalizeMember)
      if (members.length) {
        result.push({
          title: groupId.value === '0' ? `${group.groupName} · ${team.teamName}` : team.teamName,
          teamBadge: team.teamBadge ? Tools.sourceUrl(team.teamBadge) : '',
          members,
        })
      }
    }
  }
  const hiatus = collect(STATUS_HIATUS)
  if (hiatus.length) {
    result.push({ title: '暂休', teamBadge: '', members: hiatus })
  }
  const left = collect(STATUS_LEFT)
  if (left.length) {
    result.push({ title: '退团', teamBadge: '', members: left })
  }
  return result
})

/** 当前筛选下的成员总数（用于空态判断） */
const memberCount = computed(() =>
  sections.value.reduce((sum, section) => sum + section.members.length, 0),
)

onMounted(fetchGroups)

/** 拉取成员树（挂载初始化 / 双击分团 tab 刷新共用） */
async function fetchGroups() {
  loading.value = true
  try {
    groups.value = (await window.mainAPI.getMemberTree()) || []
  }
  catch (error) {
    console.error('获取成员信息失败:', error)
  }
  finally {
    loading.value = false
  }
}

/** 是否正在同步成员数据库 */
const isSyncing = ref(false)

/** 更新成员数据库：从接口同步最新名单，完成后刷新本页 */
async function syncMembers() {
  isSyncing.value = true
  try {
    await Apis.instance().syncInfo()
    ElMessage({ message: `更新完毕！注意不要频繁更新～`, type: 'success' })
    await fetchGroups()
  }
  catch (error) {
    console.error('更新成员数据库失败:', error)
  }
  finally {
    isSyncing.value = false
  }
}
</script>

<template>
  <div v-loading="loading" class="container">
    <!-- 左上角浮动分团切换：与公演页同一套交互；双击当前分团刷新成员数据 -->
    <FloatingTabBar :tabs="groupTabs" :active="groupId" @change="groupId = $event" @refresh="fetchGroups" />
    <div class="members-main">
      <el-scrollbar class="scrollbar-wrapper">
        <div class="members-container">
          <section v-for="section in sections" :key="section.title" class="group-section">
            <h2 class="team-title">
              <img
                v-if="section.teamBadge"
                class="team-badge-img"
                :src="section.teamBadge"
                alt=""
                @error="hideBadge"
              >
              <span>{{ section.title }}</span>
            </h2>
            <div class="member-list">
              <div
                v-for="member in section.members"
                :key="member.userId"
                class="member-card clickable"
                @click="selectedMember = member"
              >
                <el-image class="avatar" :src="member.avatar" fit="cover" lazy>
                  <template #placeholder>
                    <div class="avatar-ph" />
                  </template>
                  <template #error>
                    <div class="avatar-ph">
                      <el-icon :size="28">
                        <User />
                      </el-icon>
                    </div>
                  </template>
                </el-image>
                <div class="member-meta">
                  <p class="member-name" :title="member.realName">
                    {{ member.realName }}
                  </p>
                </div>
                <span
                  v-if="member.teamName"
                  class="team-badge"
                  :style="{ backgroundColor: member.teamColor ? `#${member.teamColor}` : '#909399' }"
                >
                  {{ member.teamName.replace('TEAM ', '') }}
                </span>
              </div>
            </div>
          </section>

          <el-empty
            v-if="!loading && memberCount === 0"
            class="members-empty"
            :image-size="120"
            description="暂无成员信息，可在设置里同步成员数据"
          />
        </div>
      </el-scrollbar>
    </div>

    <!-- 右下角浮动操作条：更新成员数据库 -->
    <FloatingDock>
      <span class="member-count">更新成员数据库</span>
      <el-button
        circle type="primary" :icon="Refresh" :loading="isSyncing"
        title="更新成员数据库" @click="syncMembers"
      />
    </FloatingDock>

    <!-- 成员详情抽屉 -->
    <MemberDetailDrawer :member="selectedMember" @close="selectedMember = null" />
  </div>
</template>

<style scoped lang="scss">
.container {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.members-main {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.members-container {
  /* 顶部留出左上角浮动切换器的空间；底部给右下角浮动按钮留空间 */
  padding: 72px 10px 88px;
}

.scrollbar-wrapper {
  height: 100%;
  overflow-x: hidden !important;
}

.group-section {
  margin-bottom: 36px;
}

.team-title {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin: 14px 4px 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);

  /* 徽章保持原始宽高比，高度与文字对齐 */
  .team-badge-img {
    flex: none;
    height: 144px;
    width: auto;
    object-fit: contain;
  }
}

.member-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.member-list {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}

.member-card.clickable {
  cursor: pointer;
}

.member-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  background: var(--el-bg-color);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out;

  &:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }

  .avatar {
    display: block;
    width: 100%;
    aspect-ratio: 3 / 4;
  }

  .avatar-ph {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--el-text-color-placeholder);
    background: var(--el-fill-color-light);
  }

  .member-meta {
    padding: 8px 10px 10px;
    text-align: center;

    p {
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .member-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .team-badge {
    position: absolute;
    top: 4px;
    left: 0px;
    padding: 2px 2px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.4;
    color: #fff;
    opacity: 0.9;
  }
}

/* 空态：竖直居中，视觉上与浮动切换器保持对称 */
.members-empty {
  padding: 80px 0 0;
}

.members-empty :deep(.el-empty__description p) {
  color: var(--el-text-color-secondary);
}
</style>
