<script setup lang="ts">
import { computed, ref } from 'vue'
import Tools from '../assets/js/tools'
import Barrage from '../components/Barrage.vue'

const props = defineProps({
  number: { type: Number, required: true },
  startTime: { type: Number, required: true },
  barrageLoaded: { type: Boolean, required: true },
})

const startDate = Tools.dateFormat(Number.parseInt(props.startTime as any), 'yyyy-MM-dd hh:mm')
const barrage = ref<any>(null)

const statusType = computed(() => props.barrageLoaded ? 'success' : 'info')
const statusText = computed(() => props.barrageLoaded ? '弹幕已加载' : '弹幕未加载')

function clear() {
  barrage.value?.clear()
}

function shoot(b: any) {
  barrage.value?.shoot(b)
}

defineExpose({ clear, shoot })
</script>

<template>
  <el-card style="height: fit-content !important;" shadow="never">
    <template #header>
      <el-row :gutter="8" justify="space-between" style="width: 100%;">
        <el-col :span="6">
          <el-tag :type="statusType">
            {{ statusText }}
          </el-tag>
        </el-col>
        <el-col :span="18" style="text-align: right;">
          <span style="font-size: 12px;">观看人数：{{ number }} </span>
          <span style="margin-left: 8px;color: #19be6b; font-size: 12px;">开始时间：{{ startDate }}</span>
        </el-col>
      </el-row>
    </template>

    <div class="barrage-container">
      <Barrage ref="barrage" class="barrage-box" />
    </div>
  </el-card>
</template>

<style scoped>
:deep(.el-card) {
  height: calc(100% - 5px) !important;
}
</style>
