import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { uiTheme } from '@/store/uiSettings.js';
import { authChecked } from '@/store/gameState.js';

export function useAuthArtwork() {
  const popHero = ref(null), artworkReady = ref(false);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let frame, generation=0, current={x:0,y:0}, target={x:0,y:0};
  function paint() {
    const el=popHero.value;if(!el)return;
    el.style.setProperty('--character-x', current.x*14+'px');
    el.style.setProperty('--character-y', current.y*7+'px');
    el.style.setProperty('--portrait-x', -current.x*9+'px');
    el.style.setProperty('--portrait-y', -current.y*4+'px');
  }
  function resetArtwork() {
    if(frame)cancelAnimationFrame(frame);frame=null;
    current={x:0,y:0};target={x:0,y:0};paint();
  }
  function step() {
    current.x+=(target.x-current.x)*.18;current.y+=(target.y-current.y)*.18;paint();
    if(Math.abs(target.x-current.x)+Math.abs(target.y-current.y)>.001)frame=requestAnimationFrame(step);
    else frame=null;
  }
  function moveArtwork(event) {
    if(uiTheme.value!=='pop'||motion.matches||!pointer.matches||event.pointerType!=='mouse')return;
    const box=popHero.value.getBoundingClientRect();
    target={x:Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1)),y:Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1))};
    if(!frame)frame=requestAnimationFrame(step);
  }
  watch([uiTheme,authChecked],async()=>{
    const ticket=++generation;artworkReady.value=false;resetArtwork();
    if(uiTheme.value!=='pop'||!authChecked.value)return;
    await nextTick();
    await Promise.all([...popHero.value?.querySelectorAll('img')||[]].map(image=>image.decode().catch(()=>{})));
    if(ticket===generation)artworkReady.value=true;
  },{immediate:true});
  const onVisibility=()=>{if(document.hidden)resetArtwork();};
  motion.addEventListener('change',resetArtwork);
  window.addEventListener('blur',resetArtwork);
  document.addEventListener('visibilitychange',onVisibility);
  onBeforeUnmount(()=>{generation++;resetArtwork();motion.removeEventListener('change',resetArtwork);window.removeEventListener('blur',resetArtwork);document.removeEventListener('visibilitychange',onVisibility);});
  return {popHero,artworkReady,moveArtwork,resetArtwork};
}
