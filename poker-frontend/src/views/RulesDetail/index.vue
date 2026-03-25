<template src="./RulesDetail.html"></template>

<script setup>
import { goBack } from "./RulesDetail.js";

// ====== 【核心防白屏机制】：强制暴露变量，防 Vite 误删 ======
const _exposeToHtml = { goBack };
</script>

<style scoped src="./RulesDetail.css"></style>
