<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * 封面图统一兜底组件（B-1）：img 加载失败时切换到占位插槽，替代各调用方
 * 自维护「失败 Set + isBroken/markBroken」的三套写法。
 *
 * 失败态为组件内部状态：列表刷新时列表项随 key 重建，失败态自动复位，
 * 无需调用方手动清理。占位内容由调用方通过默认插槽提供（文字 / 图标均可），
 * 未提供插槽时不渲染占位（仅留空，布局尺寸由外部 class 决定）。
 */
const props = defineProps<{
  src: string
  alt?: string
  /** 原生 loading 属性透传：列表长图建议 lazy（视口外不请求） */
  loading?: 'lazy' | 'eager'
}>()

const failed = ref(false)

// 换源（如刷新后封面地址变化）时重置失败态
watch(() => props.src, () => {
  failed.value = false
})

function onError() {
  failed.value = true
}
</script>

<template>
  <img
    v-if="!failed"
    class="cover-image"
    :src="src"
    :alt="alt"
    :loading="loading"
    @error="onError"
  >
  <slot v-else />
</template>

<style scoped>
.cover-image {
  display: block;
}
</style>
