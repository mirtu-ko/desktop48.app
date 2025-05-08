<template>
  <div class="shows-container">
    <h2>最近公演</h2>
    <div class="shows-list">
      <div v-for="show in shows" :key="show.id" class="show-item">
        <div class="show-image">
          <img :src="show.image" :alt="show.title">
          <span class="show-time">{{ show.date }}日 {{ show.time }}</span>
        </div>
        <h3>{{ show.title }}</h3>
      </div>
    </div>
  </div>
</template>

<script>
import Apis from '../assets/js/apis'

export default {
  name: 'Shows',
  data() {
    return {
      shows: [],
    }
  },
  async mounted() {
    await this.fetchShows()
  },
  methods: {
    async fetchShows() {
      try {
        const shows = await Apis.instance().shows()
        this.shows = shows
      }
      catch (error) {
        console.error('获取演出信息失败:', error)
      }
    },
  },
}
</script>

<style scoped>
.shows-container {
  padding: 20px;
}

.shows-list {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}

.show-item {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.show-image {
  position: relative;
  width: 100%;
  padding-top: 75%; /* 4:3 aspect ratio */
}

.show-image img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
