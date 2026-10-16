<template>
  <Teleport to="body">
    <dialog ref="dialog" class="game-settings-dialog" :data-ui-theme="uiTheme" aria-labelledby="game-settings-title" @cancel.prevent="closeSettings" @keydown.esc.stop @click="dismissOutside">
      <header class="settings-heading"><div><p class="settings-kicker">三国斗地主</p><h2 id="game-settings-title">设置</h2></div><button type="button" class="settings-close" aria-label="关闭设置" @click="closeSettings">×</button></header>
      <nav class="settings-nav" aria-label="设置分区" :data-section="activeSettingsSection"><button type="button" :aria-pressed="activeSettingsSection==='audio'" aria-controls="settings-audio-section" @click="activeSettingsSection='audio'">声音</button><button type="button" :aria-pressed="activeSettingsSection==='theme'" aria-controls="settings-theme-section" @click="activeSettingsSection='theme'">主题</button></nav>
      <div class="settings-body" :data-section="activeSettingsSection">
        <section id="settings-audio-section" class="audio-settings" aria-labelledby="audio-settings-title">
          <div class="audio-heading"><h3 id="audio-settings-title">声音</h3><button type="button" class="mute-button" :aria-pressed="!soundStatus" @click="toggleSound">{{ soundStatus ? '静音' : '恢复声音' }}</button></div>
          <div v-for="item in audioOptions" :key="item.key" class="audio-row">
            <div class="audio-label"><label :for="'setting-'+item.key">{{ item.name }}</label><output :for="'setting-'+item.key">{{ Math.round(audioLevels[item.key]*100) }}%</output></div>
            <div class="audio-control"><input :id="'setting-'+item.key" type="range" min="0" max="100" step="1" :value="Math.round(audioLevels[item.key]*100)" :style="{ '--volume': Math.round(audioLevels[item.key]*100)+'%' }" :aria-valuetext="Math.round(audioLevels[item.key]*100)+'%'" :class="{ muted: !soundStatus }" @input="audioLevels[item.key] = Number($event.target.value)/100"><button type="button" :aria-label="'试听'+item.name" :aria-pressed="sampleKind===item.key" @click="audition(item)"><svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="sampleKind===item.key" d="M8 5v14M16 5v14"/><path v-else d="m8 5 10 7-10 7Z"/></svg></button></div>
          </div>
          <div v-if="gameStarted && !showTutorial" class="effects-options"><label for="setting-effects-quality">特效</label><select id="setting-effects-quality" v-model="effectsQuality"><option value="full">完整演出</option><option value="lite">轻量演出</option></select><a href="/effects/CREDITS.md" target="_blank" rel="noopener">音效来源与署名 ↗</a></div>
          <p v-if="sampleError" class="settings-notice" role="status">{{ sampleError }}</p>
        </section>
        <section id="settings-theme-section" class="theme-settings" aria-labelledby="theme-settings-title">
          <h3 id="theme-settings-title">主题</h3>
          <fieldset class="theme-options"><legend class="sr-only">选择预览主题</legend><label v-for="theme in themes" :key="theme.id" class="theme-option"><input v-model="selectedTheme" type="radio" name="game-ui-theme" :value="theme.id"><span class="theme-name">{{ theme.name }}<small v-if="uiTheme===theme.id">当前</small></span><span class="theme-colors" :class="theme.id" aria-hidden="true"><i></i><i></i><i></i></span></label></fieldset>
          <div class="preview-heading"><span>登录封面预览</span><button type="button" class="expand-button" aria-label="放大主题预览" @click="openEnlarged"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M3 3l7 7M15 21h6v-6m0 6-7-7"/></svg></button></div>
          <button type="button" class="preview-image" :aria-label="'放大'+selected.name+'登录封面预览'" @click="openEnlarged"><Transition name="settings-preview" mode="out-in"><img :key="selected.id" :src="selected.preview" :alt="selected.name+'登录封面预览'" width="1440" height="900"></Transition></button>
        </section>
      </div>
      <footer class="settings-footer"><button type="button" class="cancel-button" @click="closeSettings">取消</button><button type="button" class="apply-button" :disabled="selectedTheme===uiTheme" @click="apply">{{ selectedTheme===uiTheme ? '当前使用' : '使用此主题' }}</button></footer>
    </dialog>
    <dialog ref="enlargedDialog" class="theme-enlarge-dialog" :data-ui-theme="uiTheme" aria-labelledby="theme-preview-title" @cancel.prevent="closeEnlarged" @keydown.esc.stop @click="dismissEnlargedOutside">
      <header><h2 id="theme-preview-title">{{ selected.name }} · 登录封面</h2><button type="button" class="settings-close" aria-label="关闭预览" @click="closeEnlarged">×</button></header>
      <img v-if="enlarged" :src="selected.preview" :alt="selected.name+'登录封面预览'" width="1440" height="900">
    </dialog>
    <div v-if="notice" class="settings-result" :data-ui-theme="uiTheme" role="status">{{ notice }}</div>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { uiTheme, themes, settingsOpen, closeSettings, applyUiTheme } from '@/store/uiSettings.js';
import { audioLevels, soundStatus, toggleSound, setMusicDucking } from '@/store/audioManager.js';
import { effectsQuality } from '@/store/battleEffects.js';
import { gameStarted } from '@/store/gameState.js';
import { showTutorial } from '@/store/tutorialState.js';

const dialog = ref(null), enlargedDialog = ref(null), enlarged = ref(false);
const selectedTheme = ref(uiTheme.value);
const activeSettingsSection = ref('audio');
const selected = computed(() => themes.find(theme => theme.id===selectedTheme.value) || themes[0]);
const notice = ref(''), sampleError = ref(''), sampleKind = ref('');
const audioOptions = [
  { key:'music', name:'音乐', src:'/audios/Welcome.mp3' },
  { key:'voice', name:'对话', src:'/audios/xiaotao/advanced-1-1.original-r3.mp3' },
  { key:'effects', name:'音效', src:'/effects/audio/card.mp3' },
];
const sampleDucking = Symbol('settings-audition');
let opener, enlargeOpener, sample, sampleTimeout, noticeTimeout;
function restoreFocus(element) {
  const target = element?.isConnected && element.getClientRects().length ? element : document.querySelector('.game-settings-button');
  target?.focus({preventScroll:true});
}
function stopSample() {
  clearTimeout(sampleTimeout);
  if(sample) { sample.pause(); sample.removeAttribute('src'); }
  sample = null; sampleKind.value = '';
  setMusicDucking(sampleDucking, false);
}
function audition(item) {
  const playing = sampleKind.value === item.key;
  stopSample(); sampleError.value = '';
  if(playing) return;
  if(!soundStatus.value) { sampleError.value='请先恢复声音'; return; }
  if(audioLevels[item.key]===0) { sampleError.value='请先调高音量'; return; }
  const audio = new Audio(item.src);
  sample = audio; sampleKind.value = item.key;
  audio.volume = audioLevels[item.key];
  setMusicDucking(sampleDucking, true, 0);
  const finish = () => { if(sample===audio) stopSample(); };
  audio.onended = finish;
  audio.onerror = () => { if(sample===audio) { finish(); sampleError.value='试听暂时不可用'; } };
  audio.play().catch(() => { if(sample===audio) { finish(); sampleError.value='请再次点击试听'; } });
  sampleTimeout = setTimeout(finish, 6000);
}
watch(audioLevels, () => { if(sample) sample.volume=audioLevels[sampleKind.value]; }, {deep:true,flush:'sync'});
watch(soundStatus, () => { if(!soundStatus.value) stopSample(); }, {flush:'sync'});
watch(settingsOpen, async open => {
  if(open) {
    opener = document.activeElement;
    selectedTheme.value = uiTheme.value;
    activeSettingsSection.value = 'audio';
    sampleError.value = '';
    await nextTick();
    if(settingsOpen.value && !dialog.value.open) { dialog.value.showModal(); dialog.value.querySelector('.settings-close').focus(); }
  } else {
    closeEnlarged(); stopSample();
    dialog.value?.close();
    restoreFocus(opener);
  }
});
function outside(event, target) {
  if(event.target!==target) return false;
  const box=target.getBoundingClientRect();
  return event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom;
}
function dismissOutside(event) { if(outside(event, dialog.value)) closeSettings(); }
function dismissEnlargedOutside(event) { if(outside(event, enlargedDialog.value)) closeEnlarged(); }
async function openEnlarged() {
  enlargeOpener=document.activeElement; enlarged.value=true;
  await nextTick(); enlargedDialog.value.showModal(); enlargedDialog.value.querySelector('button').focus();
}
function closeEnlarged() {
  if(!enlarged.value) return;
  enlargedDialog.value?.close(); enlarged.value=false; restoreFocus(enlargeOpener);
}
function apply() {
  const saved=applyUiTheme(selectedTheme.value);
  notice.value = saved ? '已使用'+selected.value.name : '已应用，本次无法保存到设备';
  clearTimeout(noticeTimeout); noticeTimeout=setTimeout(()=>notice.value='',2800);
  closeSettings();
}
const onVisibility=()=>{if(document.hidden)stopSample();};
document.addEventListener('visibilitychange',onVisibility);
onBeforeUnmount(()=>{stopSample();clearTimeout(noticeTimeout);document.removeEventListener('visibilitychange',onVisibility);dialog.value?.close();enlargedDialog.value?.close();});
</script>
<style scoped src="./GameSettings.css"></style>
