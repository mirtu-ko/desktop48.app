<script setup lang="ts">
import type { OpenLive } from '../assets/js/apis'
import Tools from '../assets/js/tools'

defineProps<{
  show: OpenLive
  isBroken: (_show: OpenLive) => boolean
}>()

defineEmits<{
  markBroken: [liveId: string]
}>()

function formatTime(stime: string): string {
  return Tools.dateFormat(Number.parseInt(stime), 'MM月dd日 hh:mm')
}
</script>

<template>
  <div class="show-card">
    <div class="show-image">
      <img v-if="!isBroken(show)" class="cover-image" :src="show.coverPath" :alt="show.title" @error="$emit('markBroken', show.liveId)">
      <div v-else class="image-placeholder">
        {{ show.title }}
      </div>
      <div v-if="show.teamList?.length" class="team-logos">
        <img
          v-for="team in show.teamList"
          :key="team.teamId"
          class="team-logo"
          :src="team.teamLogo"
          :alt="team.teamName"
          :title="team.teamName"
        >
      </div>
      <el-tag v-if="show.status === 2" class="show-tag" type="danger" size="small">
        进行中
      </el-tag>
      <span class="show-time">{{ formatTime(show.stime) }}</span>
    </div>
    <div class="show-info">
      <h3 class="ellipsis">
        {{ show.title }}
      </h3>
      <el-text v-if="show.subTitle" size="small" type="info">
        {{ show.subTitle }}
      </el-text>
    </div>
  </div>
</template>

<style scoped>
.show-image {
  position: relative;
  width: 100%;
  padding-top: 48%;
  overflow: hidden;
}

.show-image .cover-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 15px;
  line-height: 1.4;
  background: linear-gradient(135deg, var(--el-fill-color-light) 0%, var(--el-fill-color) 100%);
  overflow: hidden;
  word-break: break-all;
}

.show-info {
  padding: 5px 10px;
}

.team-logos {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
  display: flex;
  gap: 4px;
}

.team-logo {
  position: relative;
  width: 24px;
  height: 24px;
  object-fit: contain;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.show-info h3 {
  margin: 10px 0 4px;
  font-size: 16px;
  color: var(--el-text-color-primary);
}

.show-tag {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 1;
}

.show-time {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
}
</style>
