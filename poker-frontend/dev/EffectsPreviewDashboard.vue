<template>
  <main class="preview-layout">
    <aside class="preview-controls">
      <h1>对局演出</h1><p>本地开发预览<br />使用实际牌桌与特效组件</p>
      <h2>技能与出牌</h2>
      <div class="preview-buttons"><button v-for="name in examples" :key="name" @click="show(name)">{{ name }}</button></div>
      <h2>阶段提示</h2>
      <div class="preview-buttons"><button v-for="name in ['固守弃牌','他人弃牌','觉醒弃黑','归心抉择']" :key="name" @click="show(name)">{{ name }}</button></div>
      <label class="preview-size">预览尺寸<select v-model="selectedSize"><option v-for="(_, name) in sizes" :key="name">{{ name }}</option></select></label>
      <h2>连续验证</h2>
      <div class="preview-buttons"><button @click="sequence">依次播放</button><button @click="stop">清除演出</button></div>
      <div class="preview-status" role="status">{{ status }}</div>
    </aside>
    <section class="preview-canvas"><iframe ref="stage" title="牌桌演出预览" src="/dev/effects.html?stage=1" :style="{ width: sizes[selectedSize][0] + 'px', height: sizes[selectedSize][1] + 'px' }"></iframe></section>
  </main>
</template>
<script setup>
import { onUnmounted, ref } from "vue";
const props = defineProps({ examples: { type: Array, required: true } });
const selectedSize = ref("笔记本 1024 × 768");
const status = ref("选择一种演出，查看实际牌桌效果");
const stage = ref(null);
const sizes = { "桌面 1440 × 900": [1440, 900], "笔记本 1024 × 768": [1024, 768], "手机 390 × 844": [390, 844], "小屏 320 × 740": [320, 740], "横屏 844 × 390": [844, 390] };
let sequenceTimer;
const show = (scenario) => {
  stage.value.contentWindow.postMessage({ scenario }, location.origin);
  status.value = scenario === "清除" ? "演出已清除" : `正在预览：${scenario}`;
};
const sequence = () => {
  clearInterval(sequenceTimer);
  let index = 0;
  show(props.examples[index++]);
  sequenceTimer = setInterval(() => {
    if (index >= props.examples.length) clearInterval(sequenceTimer);
    else show(props.examples[index++]);
  }, 3000);
};
const stop = () => { clearInterval(sequenceTimer); show("清除"); };
onUnmounted(() => clearInterval(sequenceTimer));
</script>
