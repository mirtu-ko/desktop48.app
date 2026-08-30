<script setup lang="ts">
import { useFloatPlayers } from '../assets/js/use-float-players'
import FloatPlayer from './FloatPlayer.vue'

const { players, closePlayer } = useFloatPlayers()
</script>

<template>
  <!-- 全局画中画迷你窗：挂在布局根部，跨页面（直播/回放/公演）持续播放 -->
  <FloatPlayer
    v-for="(item, index) in players"
    :key="item.id"
    :item="item"
    :index="index"
    @close="closePlayer(item.id)"
  />
</template>
