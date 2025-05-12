<script setup lang="ts">
import { onUpdated, ref } from 'vue'
import Constants from '../assets/js/constants'

const barrageList = ref<any[]>([])

onUpdated(() => {
  const barrageUl: any = document.getElementById('barrage-ul')
  if (barrageUl) {
    barrageUl.scrollTop = barrageUl.scrollHeight
  }
})

function shoot(barrage: any) {
  if (barrageList.value.length >= Constants.MAX_BARRAGE_LENGTH) {
    barrageList.value.shift()
  }
  barrageList.value.push({
    content: barrage.content,
    username: barrage.username,
    level: barrage.level,
    time: barrage.time.replace(/\.\d*/, ''),
  })
}

function clear() {
  barrageList.value = []
}

defineExpose({ shoot, clear, barrageList })
</script>

<template>
  <el-scrollbar style="overflow-y: auto; height: 100%;">
    <ul id="barrage-ul">
      <li v-for="(barrage, index) in barrageList" :key="index" class="barrage-item">
        <span class="barrage-time">{{ barrage.time }}</span>
        <span class="barrage-username">{{ barrage.username }}：</span>
        <span>{{ barrage.content }}</span>
      </li>
    </ul>
  </el-scrollbar>
</template>

<style scoped lang="scss">
.barrage-item {
  margin-top: 4px;
  list-style: none;
  text-align: left;
  font-size: 12px;
  font-family: 'Microsoft YaHei', serif;

  .barrage-username {
    color: #18c8cc;
    margin-left: 16px;
  }

  .barrage-time {
    color: #bfbfbf;
  }
}
</style>
