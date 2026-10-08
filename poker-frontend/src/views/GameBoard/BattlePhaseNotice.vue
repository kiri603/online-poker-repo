<template>
  <div class="phase-notice" role="status" aria-live="polite">
    <div class="phase-notice-heading">
      <span class="phase-notice-title">{{ notice.title }}</span>
      <span class="phase-notice-owner">{{ notice.owner }}</span>
      <span v-if="countdown >= 0" class="phase-notice-time" :class="{ 'is-hurry': countdown <= 3 }">{{ countdown }}<small>秒</small></span>
    </div>
    <div class="phase-notice-action">
      <span>{{ notice.instruction }}</span>
      <span v-if="notice.required" class="phase-notice-progress" :class="{ 'is-ready': notice.selected === notice.required }" :aria-label="`已选择 ${notice.selected} 张，共需 ${notice.required} 张`">{{ notice.selected }}/{{ notice.required }}</span>
    </div>
  </div>
</template>
<script setup>
defineProps({ notice: { type: Object, required: true }, countdown: { type: Number, default: -1 } });
</script>
<style scoped>
.phase-notice { width: min(390px, 82vw); padding: 10px 22px 11px; background: linear-gradient(90deg, transparent, #17140de6 12%, #17140de6 88%, transparent); border: 0; border-radius: 0; text-align: left; font-family: "Microsoft YaHei", "Noto Sans SC", sans-serif; color: #e8dcc7; }
.phase-notice-heading { display: flex; align-items: baseline; gap: 10px; padding-bottom: 7px; border-bottom: 1px solid #bda26d45; font-size: 13px; }
.phase-notice-title { color: #ead397; font-weight: 600; white-space: nowrap; }
.phase-notice-owner { color: #a79d8c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; flex: 1; }
.phase-notice-time { font: 600 16px/1 Arial, sans-serif; color: #f0deaf; font-variant-numeric: tabular-nums; white-space: nowrap; }
.phase-notice-time small { font: 10px "Microsoft YaHei", sans-serif; margin-left: 3px; color: #aba08b; }
.phase-notice-time.is-hurry { color: #ff9c7e; }
.phase-notice-action { display: flex; gap: 12px; align-items: center; padding-top: 8px; font-size: 13px; line-height: 1.6; }
.phase-notice-action > span:first-child { flex: 1; }
.phase-notice-progress { color: #aba08b; font: 12px Arial, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
.phase-notice-progress.is-ready { color: #f0deaf; }
@media (max-width: 600px) { .phase-notice { width: min(300px, 80vw); padding: 9px 17px; } .phase-notice-action { font-size: 12px; } }
@media (max-height: 500px) and (orientation: landscape) { .phase-notice { padding: 7px 19px; } .phase-notice-heading { padding-bottom: 5px; } .phase-notice-action { padding-top: 5px; } }
</style>
