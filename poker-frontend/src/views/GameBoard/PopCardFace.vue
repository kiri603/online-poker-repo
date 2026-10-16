<template>
  <span class="pop-card-face" :class="{ 'is-red': red }" aria-hidden="true">
    <img v-if="special" class="special-face" :src="image" alt="" draggable="false" />
    <template v-else>
      <span class="corner"><b>{{ card.rank }}</b><span>{{ card.suit }}</span></span>
      <span v-if="royal" class="royal"><img :src="image" alt="" draggable="false" /></span>
      <svg v-else class="pip" viewBox="0 0 100 120"><path :d="pips[card.suit]"/></svg>
      <span class="corner corner-bottom"><b>{{ card.rank }}</b><span>{{ card.suit }}</span></span>
    </template>
  </span>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ card:{type:Object,required:true}, image:{type:String,required:true} });
const red = computed(()=>['♥','♦'].includes(props.card.suit));
const special = computed(()=>['SCROLL','JOKER'].includes(props.card.suit));
const royal = computed(()=>['J','Q','K'].includes(props.card.rank));
const pips = {
  '♠':'M50 2C34 25 5 42 5 63c0 23 27 33 43 13-1 18-7 27-16 38h36C58 103 53 94 52 76c16 20 43 10 43-13C95 42 66 25 50 2Z',
  '♥':'M50 108C31 82 4 63 4 36 4 7 37 5 50 27 63 5 96 7 96 36c0 27-27 46-46 72Z',
  '♣':'M50 2C24 2 20 31 35 45 4 37-8 78 18 90c12 5 23-1 30-12-1 18-7 27-16 36h36C58 103 53 94 52 78c7 11 18 17 30 12 26-12 14-53-17-45C80 31 76 2 50 2Z',
  '♦':'M50 2 94 60 50 118 6 60Z',
};
</script>
<style scoped>
.pop-card-face { position:absolute;inset:0;color:#202124;pointer-events:none;overflow:hidden;border-radius:inherit;background:#fffdf6; }
.pop-card-face.is-red { color:#a53542; }
.corner { position:absolute;left:7%;top:5%;display:grid;gap:1px;justify-items:center;line-height:1;z-index:2; }
.corner b { font:750 var(--pop-rank-size,29px)/1 "Arial Narrow","Segoe UI",sans-serif;letter-spacing:-.06em; }
.corner>span { font-size:var(--pop-suit-size,19px); }
.corner-bottom { left:auto;top:auto;right:7%;bottom:5%;transform:rotate(180deg); }
.pip { position:absolute;width:41%;height:43%;left:34%;top:31%;fill:currentColor; }
.royal { position:absolute;inset:23% 12% 12% 29%;overflow:hidden; }
.pop-card-face .royal img { position:absolute;width:155%;max-width:none;height:127%;left:-28%;top:-12%;object-fit:fill;mix-blend-mode:multiply; }
.pop-card-face .special-face { position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff; }
</style>
