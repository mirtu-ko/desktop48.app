<script setup lang="ts">
import MediaIcon from './MediaIcon.vue'

defineProps<{ angle: number }>()

const emit = defineEmits<{
  rotateLeft: []
  rotateRight: []
  reset: []
}>()
</script>

<template>
  <!-- 旋转是一个状态而非三个动作：合并成一组，中段直接显示当前角度，点击归零 -->
  <div class="action-group">
    <el-tooltip content="逆时针旋转 90°（Shift + R）" placement="bottom" :show-after="400">
      <button class="rotate-btn" aria-label="逆时针旋转 90 度" @click="emit('rotateLeft')">
        <MediaIcon name="rotateLeft" :size="16" />
      </button>
    </el-tooltip>
    <el-tooltip
      :content="angle === 0 ? '当前未旋转' : `重置为 0°（当前 ${angle}°）`"
      placement="bottom"
      :show-after="400"
    >
      <button
        class="rotate-btn rotate-angle"
        :class="{ 'is-zero': angle === 0 }"
        :aria-disabled="angle === 0"
        :aria-label="`当前旋转 ${angle} 度，点击重置`"
        @click="emit('reset')"
      >
        {{ angle }}°
      </button>
    </el-tooltip>
    <el-tooltip content="顺时针旋转 90°（R）" placement="bottom" :show-after="400">
      <button class="rotate-btn" aria-label="顺时针旋转 90 度" @click="emit('rotateRight')">
        <MediaIcon name="rotateRight" :size="16" />
      </button>
    </el-tooltip>
  </div>
</template>

<style scoped lang="scss">
/* 旋转三件套合并成一个胶囊，读起来是「一个控件」而不是三个孤立功能 */
.action-group {
  display: flex;
  align-items: center;
  border-radius: var(--radius-pill);
  background: rgba(15, 17, 26, 0.55);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.rotate-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0;
  font-size: 12px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  color: #fff;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.1s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  &:active {
    transform: scale(0.92);
  }

  & + .rotate-btn {
    border-left: 1px solid rgba(255, 255, 255, 0.14);
  }
}

/* 当前角度：0° 置灰并禁用，明确「现在没有可重置的东西」 */
.rotate-angle {
  min-width: 36px;
  font-weight: 500;

  &.is-zero {
    color: rgba(255, 255, 255, 0.35);
    cursor: default;

    &:hover {
      background: transparent;
    }

    &:active {
      transform: none;
    }
  }
}
</style>
