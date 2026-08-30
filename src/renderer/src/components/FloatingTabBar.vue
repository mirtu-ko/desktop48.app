<script setup lang="ts">
import { computed } from 'vue'

export interface FloatingTabItem {
  label: string
  key: string
  color?: string
  /** 选项左侧图标（Element Plus 图标组件，可选） */
  icon?: any
}

const props = defineProps<{
  tabs: FloatingTabItem[]
  active: string
}>()

const emit = defineEmits<{ change: [key: string] }>()

/** 激活 tab 的主题渐变：有主题色用之，否则回退品牌渐变 */
const activeColor = computed(
  () => props.tabs.find(tab => tab.key === props.active)?.color || '',
)

function tabStyle(key: string) {
  if (key !== props.active)
    return undefined
  if (!activeColor.value) {
    return {
      background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light))',
    }
  }
  return {
    background: `linear-gradient(135deg, ${activeColor.value}, ${activeColor.value})`,
    boxShadow: `0 4px 12px -4px ${activeColor.value}cc`,
  }
}

function change(key: string) {
  emit('change', key)
}
</script>

<template>
  <div class="float-tab-bar frosted-surface">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="float-tab"
      :class="{ 'is-active': active === tab.key }"
      :style="tabStyle(tab.key)"
      @click="change(tab.key)"
    >
      <el-icon v-if="tab.icon" class="tab-icon">
        <component :is="tab.icon" />
      </el-icon>
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.float-tab-bar {
  position: absolute;
  top: 6px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  max-width: 75%;
  overflow: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    height: 0;
  }
}

.float-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 9px 24px;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  color: var(--el-text-color-secondary);
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;

  &:hover {
    color: var(--el-text-color-primary);
    background: color-mix(in srgb, var(--el-border-color-lighter) 40%, transparent);
  }

  .tab-icon {
    font-size: inherit;
  }

  &.is-active {
    color: #fff;
    font-weight: 600;
    /* 激活态背景由内联主题渐变提供，见 tabStyle */
    box-shadow: 0 4px 12px -4px rgba(108, 92, 231, 0.5);
  }
}
</style>
