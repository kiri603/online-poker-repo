<template src="./RulesDetail.html"></template>

<script setup>
import { goBack } from "./RulesDetail.js";
import { uiTheme } from "@/store/uiSettings.js";
import RulesDetailPop from "./RulesDetailPop.vue";

// ====== 【核心防白屏机制】：强制暴露变量，防 Vite 误删 ======
const _exposeToHtml = { goBack, uiTheme, RulesDetailPop };
</script>

<style scoped src="./RulesDetail.css"></style>
