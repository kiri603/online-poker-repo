<template>
  <img :src="failed ? fallback : src || fallback" :alt="alt" @error="failed = true" />
</template>

<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ src: { type: String, default: '' }, alt: { type: String, default: '' } });
const fallback = '/images/emojis/01_xiao.png';
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
</script>
