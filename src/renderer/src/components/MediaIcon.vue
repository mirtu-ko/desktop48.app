<script setup lang="ts">
import { MEDIA_ICONS } from '../utils/media-icons'

defineProps<{
  /** 线性图标名，几何数据在 utils/media-icons.ts → stroke 组 */
  name: keyof typeof MEDIA_ICONS.stroke
  /** 边长（px）；缺省 1em 跟随所在文字字号 */
  size?: number
}>()
</script>

<template>
  <svg
    class="media-icon"
    :style="size ? { width: `${size}px`, height: `${size}px` } : undefined"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path :d="MEDIA_ICONS.stroke[name]" />
  </svg>
</template>

<style scoped>
/* 播放器统一线性壳：全项目同一套 stroke 粗细，替代 @element-plus/icons-vue 混排 */
.media-icon {
  display: block;
  flex-shrink: 0;
  width: 1em;
  height: 1em;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
