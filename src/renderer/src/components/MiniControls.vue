<script setup lang="ts">
import { FullScreen, Mute, VideoPause, VideoPlay } from '@element-plus/icons-vue'

defineProps({
  playing: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  isFullscreen: { type: Boolean, default: false },
  /** 录播必须可 seek，直播隐藏进度条 */
  showProgress: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
})

const emit = defineEmits(['togglePlay', 'toggleMute', 'toggleFullscreen', 'seek'])

function formatMediaTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
}

function onRangeInput(event: Event) {
  const value = Number.parseFloat((event.target as HTMLInputElement).value)
  if (Number.isNaN(value))
    return
  emit('seek', value)
}
</script>

<template>
  <div class="mini-controls">
    <button class="mini-btn" :aria-label="playing ? '暂停' : '播放'" @click="emit('togglePlay')">
      <el-icon :size="16">
        <VideoPause v-if="playing" />
        <VideoPlay v-else />
      </el-icon>
    </button>

    <template v-if="showProgress">
      <input
        type="range"
        class="mini-range"
        :min="0"
        :max="duration || 0"
        :value="currentTime"
        :aria-label="`播放进度 ${formatMediaTime(currentTime)} / ${formatMediaTime(duration)}`"
        @input="onRangeInput"
      >
      <span class="mini-time">{{ formatMediaTime(currentTime) }} / {{ formatMediaTime(duration) }}</span>
    </template>

    <button class="mini-btn" :aria-label="muted ? '取消静音' : '静音'" @click="emit('toggleMute')">
      <el-icon v-if="muted" :size="16">
        <Mute />
      </el-icon>
      <svg
        v-else
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
    <button class="mini-btn" :aria-label="isFullscreen ? '退出全屏' : '全屏'" @click="emit('toggleFullscreen')">
      <el-icon :size="16">
        <FullScreen />
      </el-icon>
    </button>
  </div>
</template>

<style scoped lang="scss">
/* 旋转态下替代原生控件：不参与旋转，恒定贴在容器底部 */
.mini-controls {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: rgba(15, 17, 26, 0.6);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(8px);
  z-index: 20;
}

.mini-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  color: #fff;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.1s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  &:active {
    transform: scale(0.92);
  }
}

/* 迷你进度条：录播必须可 seek，旋转态下也能拖进度 */
.mini-range {
  width: 140px;
  accent-color: var(--brand-primary);
  cursor: pointer;
}

.mini-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
}
</style>
