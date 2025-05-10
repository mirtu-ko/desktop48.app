<script setup lang="ts">
interface Member {
  teamName: string
  teamColor: string
}

interface UserInfo {
  nickname: string
}

interface Item {
  title: string
  liveMode: number
  liveType: number
  cover: string[]
  date: string
  userInfo: UserInfo
  member: Member
}

defineProps<{ item: Item }>()
</script>

<template>
  <el-card class="live-card" shadow="hover">
    <template #header>
      <div class="live-header">
        <span class="live-title">{{ item.title }}</span>
        <div>
          <el-tag v-if="item.liveType === 1 && item.liveMode === 0">
            直播
          </el-tag>
          <el-tag v-else-if="item.liveType === 1 && item.liveMode === 1" type="success">
            录屏
          </el-tag>
          <el-tag v-else type="warning">
            电台
          </el-tag>
        </div>
      </div>
    </template>

    <div class="cover-container">
      <el-image class="cover" :src="item.cover[0]" fit="cover" lazy />
    </div>
    <p class="live-date">
      {{ item.date }}
    </p>
    <div style="display: flex;justify-content: space-between;">
      <div class="member-info">
        <span style="color: #000;">{{ item.userInfo.nickname }}</span>
        <span
          v-if="item.member && item.member.teamName"
          class="team-badge"
          :style="{ 'background-color': `#${item.member.teamColor}` }"
        >
          {{ item.member.teamName.replace('TEAM ', '') }}
        </span>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.live-card {
  cursor: pointer;
  min-height: 100px;
}

.live-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
