<template>
  <aside class="stage-preview-controls">
    <button class="stage-preview-toggle" @click="open = !open" :aria-expanded="open">{{ open ? '收起演出面板' : '演出面板' }}</button>
    <div v-if="open" class="stage-preview-panel">
      <div class="stage-preview-buttons"><button v-for="name in scenarios" :key="name" @click="play(name)">{{ name }}</button></div>
      <label class="stage-preview-mode">画面预览<select v-model="mode"><option value="live">实时播放</option><option value="entry">入场定格</option><option value="windup">蓄力定格</option><option value="strike">挥斩定格</option><option value="impact">冲击定格</option><option value="end">收尾定格</option></select></label>
      <p>点击演出按钮播放。此页仅用于本地开发。</p>
    </div>
  </aside>
</template>
<script setup>
import { ref } from "vue";
defineProps({ scenarios: { type: Array, required: true } });
const emit = defineEmits(["scenario"]);
const open = ref(true);
const mode = ref("live");
const play = (name) => { emit("scenario", name, mode.value); open.value = false; };
</script>
<style scoped>
.stage-preview-controls { position: fixed; left: 10px; top: 10px; z-index: 5000; font: 11px "Microsoft YaHei", sans-serif; }
.stage-preview-controls button { color: #f0dab4; background: #221910ed; border: 1px solid #c6a16e77; border-radius: 4px; padding: 8px; font-size: 11px; cursor: pointer; }
.stage-preview-controls button:hover { background: #543b25; }
.stage-preview-controls button:focus-visible { outline: 2px solid #fff0c2; }
.stage-preview-panel { width: 240px; background: #18120ef5; border: 1px solid #8a704644; padding: 10px; margin-top: 6px; max-height: 70vh; overflow-y: auto; border-radius: 5px; }
.stage-preview-buttons { display: grid; grid-template-columns: repeat(3,1fr); gap: 5px; }
.stage-preview-mode { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; color: #b2a089; }
.stage-preview-mode select { padding: 5px; color: #f0dab4; background: #221910; border: 1px solid #c6a16e77; border-radius: 3px; font: inherit; }
.stage-preview-panel p { color: #b2a089; line-height: 1.6; margin: 9px 0 0; font-size: 10px; }
</style>
