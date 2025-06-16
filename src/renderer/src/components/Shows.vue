<script setup lang="ts">
import type { TabsPaneContext } from 'element-plus'
import { onMounted, ref, watch } from 'vue'
import Apis from '../assets/js/apis'

interface Show {
  id: number
  title: string
  image: string
  date: string
  time: string
}

interface watchcontent {
  id: number
  title: string
  image: string
  description: string
  startTime: number
  endTime: number
  status: string
}

const shows = ref<Show[]>([])

const showToday = ref<watchcontent[]>()

const key = ref('1')

async function fetchShows() {
  try {
    const showsData = await Apis.instance().shows(key.value)
    shows.value = showsData.shows
    if (showsData.watchContent) {
      showToday.value = showsData.watchContent
    }
  }
  catch (error) {
    console.error('获取演出信息失败:', error)
  }
}

onMounted(async () => {
  await fetchShows()
})

watch(key, async () => {
  await fetchShows()
})

// 格式化时间戳的函数
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000) // 转换为毫秒
  return date.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function handleClick(tab: TabsPaneContext) {
  console.log(tab.props.label)
  if (tab.props.label === 'SNH48') {
    key.value = '1'
  }
  if (tab.props.label === 'BEJ48') {
    key.value = '2'
  }
  if (tab.props.label === 'GNZ48') {
    key.value = '3'
  }
  if (tab.props.label === 'CKG48') {
    key.value = '5'
  }
  if (tab.props.label === 'CGT48') {
    key.value = '6'
  }
}

function openLiveStream(showId: number) {
  window.open(`https://live.48.cn/Index/inlive/id/${showId}`, '_blank')
}
</script>

<template>
  <div class="container">
    <el-tabs @tab-click="handleClick">
      <el-tab-pane label="SNH48" />
      <el-tab-pane label="BEJ48" />
      <el-tab-pane label="GNZ48" />
      <el-tab-pane label="CKG48" />
      <el-tab-pane label="CGT48" />
    </el-tabs>
    <el-scrollbar wrap-class="scrollbar-wrapper">
      <div class="shows-container">
        <h2>即将开始</h2>
        <div v-if="showToday?.length" class="showToday-list">
          <div v-for="show in showToday" :key="show.id" class="show-item" @click="openLiveStream(show.id)" style="cursor: pointer">
            <div class="show-image">
              <img :src="show.image" :alt="show.title">
              <span class="show-time">{{ `${formatTimestamp(show.startTime)} - ${formatTimestamp(show.endTime)}` }}</span>
            </div>
            <div class="show-info">
              <h3>{{ show.title }}</h3>
              <el-text>
                {{ show.description }}
              </el-text>
            </div>
          </div>
        </div>
        <div v-else>
          <p>暂无演出信息</p>
        </div>
        <h2>最近公演</h2>
        <div v-if="shows.length" class="shows-list">
          <div v-for="show in shows" :key="show.id" class="show-item">
            <div class="show-image">
              <img :src="show.image" :alt="show.title">
              <span class="show-time">{{ show.date }}日 {{ show.time }}</span>
            </div>
            <h3>{{ show.title }}</h3>
          </div>
        </div>
        <div v-else>
          <p>暂无演出信息</p>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.container {
  height: 100%;
  overflow: hidden;
}

.shows-container {
  padding: 0 10px;
}

.scrollbar-wrapper {
  height: calc(100% - 60px);
  overflow-x: hidden !important;
}

.shows-list {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.showToday-list {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
}

.show-item {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease-in-out;
}

.show-image {
  position: relative;
  width: 100%;
  padding-top: 48%; /* 4:3 aspect ratio */
}

.show-image img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.show-info {
  padding: 5px 10px;
}

.show-time {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
}

.show-item h3 {
  margin: 10px;
  font-size: 16px;
  color: #333;
}
</style>
