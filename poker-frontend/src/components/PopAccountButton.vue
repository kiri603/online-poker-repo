<template>
  <button v-if="authUser" type="button" class="player-trigger" :class="{ floating }" aria-haspopup="dialog"
    :aria-expanded="socialProfileVisible" :aria-label="'个人中心：'+(authUser.nickname || authUser.username)" @click="handleAccountClick">
    <PlayerAvatar :src="accountAvatar" alt="" />
    <span class="trigger-name" :title="authUser.nickname || authUser.username">{{ authUser.nickname || authUser.username }}</span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    <span v-if="socialNotificationCount > 0" class="notification-dot" aria-label="有新的社交提醒">{{ socialNotificationCount }}</span>
  </button>
</template>

<script setup>
import PlayerAvatar from './PlayerAvatar.vue';
import { authUser, accountAvatar, handleAccountClick, socialProfileVisible, socialNotificationCount } from '@/views/Social/AccountHub.js';
defineProps({ floating: Boolean });
</script>

<style scoped>
.player-trigger { position:relative; display:inline-flex; align-items:center; gap:10px; flex:0 1 auto; min-width:0; max-width:100%; min-height:44px; padding:0; border:0; background:transparent; color:var(--ink,#202124); font:13px "Microsoft YaHei","PingFang SC",system-ui,sans-serif; cursor:pointer; touch-action:manipulation; }
.player-trigger img { box-sizing:border-box; width:36px; height:36px; flex:none; object-fit:cover; border-radius:50%; border:1px solid var(--ink,#202124); }
.trigger-name { min-width:0; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.player-trigger svg { width:16px; height:16px; flex:none; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.notification-dot { position:absolute; top:0; right:-5px; min-width:16px; height:16px; font-size:9px; display:grid; place-items:center; background:var(--red,#a53542); color:var(--paper,#fff1d7); border-radius:50%; }
.player-trigger:focus-visible { outline:3px solid var(--red,#a53542); outline-offset:5px; }
.player-trigger:active { opacity:.75; }
.floating { position:absolute; z-index:30; top:28px; right:160px; }
@media(max-width:1150px) { .floating { right:136px; } }
@media(max-width:800px) { .floating { top:23px; right:122px; } }
@media(max-width:520px) {
  .floating { top:19px; right:74px; }
  .player-trigger img { width:30px; height:30px; }
  .trigger-name,.player-trigger svg { display:none; }
}
@media(orientation:landscape) and (max-height:580px) and (min-width:801px) { .floating { top:14px; right:126px; } }
@media(prefers-reduced-motion:no-preference) { .player-trigger { transition:opacity .15s; } }
</style>
