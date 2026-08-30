<script setup lang="ts">
// 统一右下角磨砂玻璃浮层：直播/回放/公演三页共用
</script>

<template>
  <div class="floating-dock frosted-surface">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.floating-dock {
  position: absolute;
  right: 8px;
  bottom: 20px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100% - 40px);
  padding: 6px 12px;
  border-radius: 999px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    height: 0;
  }
}

/* 渐变刷新悬浮球 */
.floating-dock :deep(.el-button--primary) {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light));
  border: none;
  box-shadow: 0 6px 16px -4px rgba(108, 92, 231, 0.5);
}
</style>
