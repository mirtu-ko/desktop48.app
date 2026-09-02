<script setup lang="ts">
import { FullScreen } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { MEDIA_ICONS } from '../utils/media-icons'
import { formatMediaTime } from '../utils/time-format'

const props = defineProps({
  playing: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  isFullscreen: { type: Boolean, default: false },
  /** 录播必须可 seek，直播隐藏进度条 */
  showProgress: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  /** 系统画中画：仅视频轨适用，电台（纯音频）由宿主传 false 隐藏 */
  showPip: { type: Boolean, default: false },
  isPip: { type: Boolean, default: false },
})

const emit = defineEmits(['togglePlay', 'toggleMute', 'toggleFullscreen', 'togglePip', 'seek'])

// 图标随状态切换，几何数据统一在 utils/media-icons.ts
const playIcon = computed(() => (props.playing ? MEDIA_ICONS.stroke.pause : MEDIA_ICONS.stroke.play))
const volumeIcon = computed(() => (props.muted ? MEDIA_ICONS.stroke.volumeOff : MEDIA_ICONS.stroke.volumeOn))
// PiP 能力探测（Chromium/Electron 常开，防御性判断环境）
const pipSupported = (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true

function onRangeInput(event: Event) {
  const value = Number.parseFloat((event.target as HTMLInputElement).value)
  if (Number.isNaN(value))
    return
  emit('seek', value)
}
</script>

<template>
  <!-- 全自绘控制条：直播与录播共用同一条胶囊。
       直播在 #leading 插槽放状态段（LIVE 徽标/时长），录播用内置进度段；
       加载期间整条随宿主 v-if 隐藏，连接中不显示 LIVE 状态。 -->
  <div class="mini-controls">
    <slot name="leading" />

    <button class="mini-btn" :aria-label="playing ? '暂停' : '播放'" @click="emit('togglePlay')">
      <svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="playIcon" />
      </svg>
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
      <svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="volumeIcon" />
      </svg>
    </button>
    <button
      v-if="showPip && pipSupported"
      class="mini-btn"
      :aria-label="isPip ? '退出画中画' : '画中画'"
      :title="isPip ? '退出画中画' : '画中画'"
      @click="emit('togglePip')"
    >
      <svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="MEDIA_ICONS.stroke.pip" />
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
/* 全自绘控制条：不参与旋转，恒定贴在容器底部；窄容器（迷你浮窗）下限宽自适应 */
.mini-controls {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 36px);
  min-width: 0;
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

/* 按钮永不收缩：拥挤时让位给进度条 / 时间 / leading 插槽内容 */
.mini-btn {
  flex: 0 0 auto;
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

/* 图标壳：几何数据在 utils/media-icons.ts，这里统一线性表现 */
.mini-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 迷你进度条：录播必须可 seek；空间不足时最先收缩（可压到 0 也不溢出按钮） */
.mini-range {
  flex: 0 1 140px;
  min-width: 0;
  accent-color: var(--brand-primary);
  cursor: pointer;
}

.mini-time {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
