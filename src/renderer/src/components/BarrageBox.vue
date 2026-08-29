<script setup lang="ts">
import type { BarrageListItem } from './Barrage.vue'
import { Search } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import Tools from '../assets/js/tools'
import Barrage from '../components/Barrage.vue'

const props = defineProps<{
  number: number
  startTime: number
  barrageLoaded: boolean
  // 已投放到当前播放进度的弹幕（从头到当前时刻）
  items: BarrageListItem[]
  // 全量弹幕，仅搜索时使用，这样能搜到播放进度之后的内容
  allItems: BarrageListItem[]
}>()

const emit = defineEmits<{ seek: [seconds: number] }>()

const startDate = Tools.dateFormat(Number.parseInt(props.startTime as any), 'yyyy-MM-dd hh:mm')
const keyword = ref('')

const statusType = computed(() => props.barrageLoaded ? 'success' : 'info')
const statusText = computed(() => props.barrageLoaded ? '弹幕已加载' : '弹幕未加载')

const trimmedKeyword = computed(() => keyword.value.trim().toLowerCase())

// 搜索命中全量弹幕，方便直接跳到后面的片段；无关键词时只看已播放部分
const displayItems = computed(() => {
  if (!trimmedKeyword.value)
    return props.items

  return props.allItems.filter(item =>
    item.content?.toLowerCase().includes(trimmedKeyword.value)
    || item.username?.toLowerCase().includes(trimmedKeyword.value),
  )
})

const emptyText = computed(() => {
  if (trimmedKeyword.value)
    return '没有匹配的弹幕'
  return props.barrageLoaded ? '当前进度还没有弹幕' : '弹幕加载中…'
})
</script>

<template>
  <div class="barrage-panel">
    <div class="panel-header">
      <div class="header-line">
        <el-tag :type="statusType" size="small">
          {{ statusText }}
        </el-tag>
        <span class="meta">观看人数：{{ number }}</span>
        <span class="meta meta-time">{{ startDate }}</span>
      </div>
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        size="small"
        clearable
        placeholder="搜索弹幕内容或用户名"
      />
      <div v-if="trimmedKeyword" class="search-tip">
        命中 {{ displayItems.length }} 条，点击可跳转
      </div>
    </div>

    <div class="panel-body">
      <Barrage
        :items="displayItems"
        :keyword="keyword"
        :empty-text="emptyText"
        @seek="seconds => emit('seek', seconds)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.barrage-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #fff;
  border-left: 1px solid #ebeef5;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #ebeef5;
}

.header-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta {
  font-size: 12px;
  color: #909399;
}

.meta-time {
  margin-left: auto;
  color: #19be6b;
}

.search-tip {
  font-size: 12px;
  color: #909399;
}

/* min-height: 0 是必需的，否则 flex 子项会被内容撑开导致外层出现滚动条 */
.panel-body {
  flex: 1;
  min-height: 0;
  padding: 4px 6px;
}
</style>
