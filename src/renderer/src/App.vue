<script setup lang="ts">
import { ref } from 'vue'
import Index from './components/Index.vue'
import Initialize from './components/Initialize.vue'
import Versions from './components/Versions.vue'

const isInitialized = ref(false)

function onInitialized() {
  console.log('[App.vue] onInitialized')
  isInitialized.value = true
}
</script>

<template>
  <div id="app">
    <Initialize v-if="!isInitialized" @on-initialized="onInitialized" />
    <Index v-else />
    <Versions />
  </div>
</template>
