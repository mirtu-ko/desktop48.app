<script setup lang="ts">
// 统一右上角磨砂玻璃浮层容器：五个列表页经 FloatingRefreshDock 组合使用
</script>

<template>
  <div class="floating-dock frosted-surface no-scrollbar">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.floating-dock {
  position: absolute;
  right: 8px;
  top: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100% - 40px);
  padding: 4px;
  border-radius: 999px;
  overflow-x: auto;
}
</style>
