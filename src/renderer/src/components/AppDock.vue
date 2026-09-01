<script setup lang="ts">
// 统一底部 Dock 导航：磨砂表层复用全局 .frosted-surface
export interface DockItem {
  /** 路由 path */
  index: string
  label: string
  /** Element Plus 图标组件 */
  icon: any
}

defineProps<{
  items: DockItem[]
  active: string
}>()

const emit = defineEmits<{ change: [index: string] }>()

function change(index: string) {
  emit('change', index)
}
</script>

<template>
  <nav class="app-dock frosted-surface">
    <el-tooltip
      v-for="item in items"
      :key="item.index"
      :content="item.label"
      placement="top"
      :show-after="400"
      :offset="10"
    >
      <button
        type="button"
        class="dock-item"
        :class="{ 'is-active': active === item.index }"
        @click="change(item.index)"
      >
        <span class="dock-icon">
          <el-icon><component :is="item.icon" /></el-icon>
        </span>
        <span class="dock-label">{{ item.label }}</span>
      </button>
    </el-tooltip>
  </nav>
</template>

<style scoped lang="scss">
/* 底部 Dock：磨砂玻璃表层由全局 .frosted-surface 提供，
 * 此处只保留 Dock 特有的定位与布局 */
.app-dock {
  position: fixed;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 7px 12px 7px;
  border-radius: 20px;
  user-select: none;
}

.dock-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 58px;
  padding: 7px 0 6px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;

  .dock-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--el-fill-color-light) 70%, transparent);
    color: inherit;
    transition:
      background-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;

    .el-icon {
      font-size: 19px;
    }
  }

  .dock-label {
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 0.3px;
    color: var(--el-text-color-secondary);
    transition: color 0.2s ease;
  }

  &:hover {
    transform: translateY(-3px);
    background: var(--el-color-primary-light-9);

    .dock-icon {
      background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
    }
  }

  &.is-active {
    .dock-icon {
      background: linear-gradient(90deg, var(--brand-primary), var(--brand-primary-light));
      color: #fff;
      box-shadow: var(--shadow-glow);
    }

    .dock-label {
      color: var(--el-color-primary);
      font-weight: 600;
    }
  }
}
</style>
