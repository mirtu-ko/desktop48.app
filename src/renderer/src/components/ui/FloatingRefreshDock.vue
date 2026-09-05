<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import FloatingDock from './FloatingDock.vue'

/**
 * 右上角浮动操作条 + 圆形刷新按钮的复合组件。
 * 直播/公演/专辑/成员/回放页同构的「FloatingDock + Refresh」组合收敛于此；
 * 需要补充计数、筛选等控件时放进默认插槽（渲染在刷新按钮之前）。
 */
withDefaults(defineProps<{
  /** 刷新进行中：按钮转圈并禁点 */
  loading?: boolean
  /** 按钮 title */
  title?: string
}>(), {
  loading: false,
  title: '刷新',
})

const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <FloatingDock>
    <slot />
    <el-button
      circle
      type="primary"
      :icon="Refresh"
      :loading="loading"
      :title="title"
      @click="emit('refresh')"
    />
  </FloatingDock>
</template>
