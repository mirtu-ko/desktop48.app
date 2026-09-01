<script setup lang="ts">
import type { FloatPlayerItem } from '../assets/js/use-float-players'
import { Close, Minus, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LivePlayer from './LivePlayer.vue'
import ReviewPlayer from './ReviewPlayer.vue'

const props = defineProps<{
  item: FloatPlayerItem
  /** 当前在窗口列表中的下标，用于 z-index 置顶排序 */
  index: number
}>()

const emit = defineEmits(['close'])

// 三种形态尺寸：迷你 / 放大（回放放大时恢复弹幕侧栏）/ 折叠胶囊条
// 每个尺寸都按视频宽高比区分横竖屏：直播横屏自动套用更宽的窗口，避免窄竖窗塞横画面的尴尬。
// 回放的放大态带右侧弹幕侧栏，无论横竖屏都保持横屏布局。
const MINI_SIZE = {
  live: { portrait: { w: 320, h: 540 }, landscape: { w: 640, h: 360 } },
  review: { portrait: { w: 320, h: 540 }, landscape: { w: 640, h: 360 } },
}
const EXPAND_SIZE = {
  live: { portrait: { w: 540, h: 800 }, landscape: { w: 1080, h: 720 } },
  review: { portrait: { w: 1080, h: 720 }, landscape: { w: 1280, h: 800 } },
}
const PILL_SIZE = { w: 280, h: 40 }
const TITLE_BAR_HEIGHT = 36

// 视频是否为横屏（由子播放器上报，含旋转），默认竖屏
const landscape = ref(false)

const kind = computed(() => props.item.kind)

// 标题栏：有主播名时展示「主播名 · 标题」，否则回退到 title
const barTitle = computed(() => {
  const { nickname, title } = props.item.payload
  if (nickname)
    return `${nickname}: ${title}`
  return title
})
const collapsed = ref(false)
const expanded = ref(false)
// 头部头像：由子播放器加载完成（或 open 模式传入）后上报，显示在 fp-bar
const avatarUrl = ref('')
function onAvatar(url: string) {
  if (url)
    avatarUrl.value = url
}

// 当前窗口尺寸：折叠态返回胶囊条，否则按形态（迷你/放大）与横竖屏取对应档位
const orientName = computed(() => (landscape.value ? 'landscape' : 'portrait'))
const size = computed(() => {
  if (collapsed.value)
    return PILL_SIZE
  if (expanded.value)
    return EXPAND_SIZE[kind.value][orientName.value]
  return MINI_SIZE[kind.value][orientName.value]
})

// 初始位置：从右上角开始按创建序号级联错位，避免多窗完全重叠
const order = props.item.order
const pos = ref({
  x: Math.max(12, window.innerWidth - MINI_SIZE[kind.value].portrait.w - 24 - (order % 6) * 36),
  y: Math.max(TITLE_BAR_HEIGHT + 36, TITLE_BAR_HEIGHT + 60 + (order % 6) * 36),
})

const windowStyle = computed(() => ({
  left: `${pos.value.x}px`,
  top: `${pos.value.y}px`,
  width: `${size.value.w}px`,
  height: `${size.value.h}px`,
  zIndex: 1000 + props.index,
}))

let dragging = false
let dragStart = { x: 0, y: 0 }
let basePos = { x: 0, y: 0 }

function clampX(x: number) {
  return Math.min(Math.max(0, x), Math.max(0, window.innerWidth - size.value.w))
}

function clampY(y: number) {
  return Math.min(Math.max(TITLE_BAR_HEIGHT, y), Math.max(TITLE_BAR_HEIGHT, window.innerHeight - size.value.h))
}

// 子播放器上报视频宽高比后据此切换窗口横竖比例
function onOrientation(isLandscape: boolean) {
  landscape.value = isLandscape
  // 尺寸变化后把窗口重新约束在视口内
  pos.value.x = clampX(pos.value.x)
  pos.value.y = clampY(pos.value.y)
}

function onBarMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  // 点击操作按钮不触发拖拽
  if (target.closest('.fp-actions'))
    return
  dragging = true
  dragStart = { x: e.clientX, y: e.clientY }
  basePos = { x: pos.value.x, y: pos.value.y }
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
}

function onWindowMouseMove(e: MouseEvent) {
  if (!dragging)
    return
  pos.value.x = clampX(basePos.x + e.clientX - dragStart.x)
  pos.value.y = clampY(basePos.y + e.clientY - dragStart.y)
}

function onWindowMouseUp() {
  if (!dragging)
    return
  dragging = false
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  snapToEdge()
}

// 松开后若贴近屏幕边缘则自动吸附
function snapToEdge() {
  const { x, y } = pos.value
  const w = size.value.w
  if (x < 16)
    pos.value.x = 0
  else if (x + w > window.innerWidth - 16)
    pos.value.x = window.innerWidth - w
  if (y < TITLE_BAR_HEIGHT + 24)
    pos.value.y = TITLE_BAR_HEIGHT
}

// 窗口尺寸变化（如窗口缩放）时把迷你窗拉回可视区域
function onWindowResize() {
  pos.value.x = clampX(pos.value.x)
  pos.value.y = clampY(pos.value.y)
}

function onClose() {
  emit('close')
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
  if (collapsed.value)
    expanded.value = false
}

function toggleExpand() {
  expanded.value = !expanded.value
  if (expanded.value)
    collapsed.value = false
  // 放大后窗口变宽，重新约束在视口内
  pos.value.x = clampX(pos.value.x)
  pos.value.y = clampY(pos.value.y)
}

// 标题栏双击：在 MINI_SIZE → EXPAND_SIZE → PILL_SIZE 之间循环切换
function cycleSize() {
  if (expanded.value) {
    // EXPAND → PILL（折叠胶囊）
    expanded.value = false
    collapsed.value = true
  }
  else if (collapsed.value) {
    // PILL → MINI（还原迷你窗）
    collapsed.value = false
  }
  else {
    // MINI → EXPAND（放大）
    expanded.value = true
  }
  // 尺寸变化后把窗口重新约束在视口内
  pos.value.x = clampX(pos.value.x)
  pos.value.y = clampY(pos.value.y)
}

// 双击标题栏快速折叠/还原
function onBarDblClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.fp-actions'))
    return
  cycleSize()
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
})
</script>

<template>
  <div
    class="fp-window"
    :class="{ 'is-collapsed': collapsed }"
    :style="windowStyle"
  >
    <div
      class="fp-bar"
      @mousedown="onBarMouseDown"
      @dblclick="onBarDblClick"
    >
      <span class="fp-kind" :class="{ 'is-review': kind === 'review' }">
        {{ kind === 'live' ? '直播' : '回放' }}
      </span>
      <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" class="fp-avatar">
      <span class="fp-title" :title="barTitle">
        {{ barTitle }}
      </span>
      <div class="fp-actions">
        <el-button
          v-if="collapsed" circle size="small" :icon="ZoomIn"
          title="还原窗口" @click.stop="toggleCollapse"
        />
        <template v-else>
          <el-button
            circle size="small" :icon="expanded ? ZoomOut : ZoomIn"
            :title="expanded ? '缩小还原' : '放大窗口'" @click.stop="toggleExpand"
          />
          <el-button
            circle size="small" :icon="Minus"
            title="折叠为迷你条" @click.stop="toggleCollapse"
          />
        </template>
        <el-button
          circle size="small" :icon="Close"
          title="关闭" @click.stop="onClose"
        />
      </div>
    </div>

    <div v-show="!collapsed" class="fp-body">
      <LivePlayer
        v-if="kind === 'live'"
        :live-title="item.payload.title"
        :live-id="item.payload.liveId"
        :start-time="item.payload.startTime"
        :live-type="item.payload.liveType ?? 1"
        :live-mode="item.payload.liveMode ?? 0"
        :source="item.payload.source || 'user'"
        :avatar-url="item.payload.avatar || ''"
        :compact="!expanded"
        @avatar="onAvatar"
        @orientation="onOrientation"
        @close="onClose"
      />
      <ReviewPlayer
        v-else
        :live-title="item.payload.title"
        :live-id="item.payload.liveId"
        :start-time="item.payload.startTime"
        :source="item.payload.source || 'user'"
        :avatar-url="item.payload.avatar || ''"
        :compact="!expanded"
        @avatar="onAvatar"
        @orientation="onOrientation"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.fp-window {
  position: fixed;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--el-bg-color) 90%, transparent);
  backdrop-filter: blur(18px) saturate(180%);
  border: 1px solid color-mix(in srgb, var(--el-border-color) 45%, transparent);
  box-shadow: var(--shadow-lg);
  transition:
    width 0.2s ease,
    height 0.2s ease;
}

.fp-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 8px 0 12px;
  flex-shrink: 0;
  cursor: move;
  user-select: none;
  -webkit-app-region: no-drag;
  border-bottom: 1px solid color-mix(in srgb, var(--el-border-color) 35%, transparent);

  :deep(.el-button) {
    margin-left: 0;
  }
}

.fp-window.is-collapsed .fp-bar {
  border-bottom: none;
}

.fp-kind {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light));

  &.is-review {
    background: linear-gradient(135deg, var(--brand-secondary), #ffb0c8);
  }
}

.fp-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: contain;
  border: 1px solid color-mix(in srgb, var(--el-border-color) 40%, transparent);
}

.fp-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.fp-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.fp-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
