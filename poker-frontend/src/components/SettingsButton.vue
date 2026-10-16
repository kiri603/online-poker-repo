<template>
  <button type="button" class="game-settings-button" :class="{ compact }" :data-ui-theme="uiTheme" aria-label="设置" title="设置" aria-haspopup="dialog" @click="openSettings">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m9 3-.6 2.3-2 .9-2.2-.6-2 3.4 1.6 1.7v2.6l-1.6 1.7 2 3.4 2.2-.6 2 .9L9 21h6l.6-2.3 2-.9 2.2.6 2-3.4-1.6-1.7v-2.6l1.6-1.7-2-3.4-2.2.6-2-.9L15 3Z"/></svg>
    <span v-if="!compact">设置</span>
  </button>
</template>
<script setup>
import { openSettings, uiTheme } from '@/store/uiSettings.js';
defineProps({ compact: Boolean });
</script>
<style scoped>
.game-settings-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-width:44px; min-height:44px; padding:8px 12px; background:#24130be6; border:1px solid #b89652; border-radius:8px; color:#ffe4ae; font:14px/1.2 "Microsoft YaHei",sans-serif; cursor:pointer; touch-action:manipulation; }
.game-settings-button svg { width:21px; height:21px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; flex:none; }
.game-settings-button.compact { width:44px; padding:10px; }
.game-settings-button:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
.game-settings-button[data-ui-theme=pop] { background:#fff1d7;color:#202124;border:1px solid #202124;border-radius:2px;box-shadow:2px 2px 0 #202124;font-weight:600; }
.game-settings-button[data-ui-theme=pop] svg { stroke-width:1.8; }
.game-settings-button[data-ui-theme=pop]:hover { background:#f3d5dd;color:#a53542; }
.game-settings-button[data-ui-theme=pop]:active { box-shadow:none; }
@media(prefers-reduced-motion:no-preference) { .game-settings-button,.game-settings-button span { transition:color 160ms,background 160ms,border-color 220ms; }.game-settings-button:hover svg { transform:rotate(18deg); }.game-settings-button svg { transition:transform 220ms; } }
</style>
