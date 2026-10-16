import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const chapters = [
  { id: 'cards', short: '牌型', title: '牌型与大小',
    entries: [
      { name: '单牌大小', text: '大王 > 小王 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3。' },
      { name: '合法牌型', text: '单张、对子、三不带、三带一、三带一对、顺子、连对、飞机、炸弹、王炸。',
        note: '顺子 5 张起；连对 3 对起；飞机支持纯飞机、飞机带单和飞机带对。' }
    ] },
  { id: 'pass', short: '过牌', title: '过牌与惩罚',
    entries: [
      { name: '常规过牌，摸 2 张', text: '有牌可主动选择「要不起」；没有更大的牌时，系统自动判定「要不起」。' },
      { name: '空桌必须出牌', text: '自由出牌回合，不能选择过牌。', noteLabel: '豁免情况', note: '手里全是被锁定的锦囊牌时，可触发过牌豁免。' }
    ] },
  { id: 'skills', short: '武将', title: '武将技能',
    intro: '房主开启后，每人开局选择一项技能。',
    entries: [
      { name: '制衡', tag: '主动 · 出牌阶段限 1 次', text: '弃置 1 张手牌，重新摸 1 张，然后继续出牌。' },
      { name: '乱箭', tag: '主动 · 出牌阶段限 1 次', text: '弃置 2 张黑色手牌，当作「万箭齐发」打出。自己也受波及，但可用任意牌响应；响应结束后摸 2 张。' },
      { name: '观星', tag: '被动 · 改变过牌', text: '要不起时，观看牌堆顶 5 张，选 2 张加入手牌，其余弃置，替代随机摸 2 张。' },
      { name: '固守', tag: '主动 · 代替要不起', text: '摸 4 张，结束回合。下回合能接上牌时先弃 2 张，手牌不足则全弃；仍要不起时，免除摸 2 张惩罚。' },
      { name: '苦肉', tag: '主动 · 每回合最多 2 次', text: '弃 2 张，摸 4 张。累计发动 3 次觉醒；觉醒后，每次主动成功打出普通牌型，可额外弃 1 张黑色牌或跳过。',
        note: '觉醒弃黑仅普通出牌触发；锦囊、借刀杀人的被选中出牌、AOE 响应都不触发。' },
      { name: '铁骑', tag: '被动 · 红牌判定', text: '主动打出含红色牌的普通牌型后，亮出 1 张判定牌。同为红色，且点数严格小于本次最大红色牌时，触发「压制」。',
        effect: '压制：其余存活玩家各罚摸 2 张，清空桌面，立即回到你的回合。',
        note: '压制使其余存活玩家强制要不起。判定失败则正常轮到下家，判定牌均弃置。锦囊、AOE 响应和借刀杀人的被选中出牌均不触发。' },
      { name: '归心', tag: '主动 · 回合内发动', text: '其他存活角色各摸 2 张，你结束回合，归心禁用。之后桌面是你的牌且他人要不起、固守或观星时，可保护对方并解除禁用。',
        note: '保护有 10 秒响应时间。发动后，目标本次不摸牌；固守摸 4 和下回合增益、观星翻牌选牌均不触发。不发动则按原流程结算。' }
    ] },
  { id: 'tricks', short: '锦囊', title: '锦囊牌',
    intro: '开启锦囊后，牌库增至 58 张。以下无花色锦囊各 1 张。',
    entries: [
      { name: '万箭齐发', tag: '全场响应', text: '所有存活玩家，包括发动者，弃 1 张黑色牌或小王，否则罚摸 2 张。' },
      { name: '南蛮入侵', tag: '全场响应', text: '所有存活玩家，包括发动者，弃 1 张红色牌或大王，否则罚摸 2 张。' },
      { name: '五谷丰登', tag: '顺时针选牌', text: '展示与存活人数相等的牌。从发动者开始，顺时针每人选 1 张加入手牌。' },
      { name: '借刀杀人', tag: '移交回合 · 10 秒', text: '桌面有他人的牌时使用。将回合交给下一位存活玩家，限时 10 秒，期间不能用锦囊或技能。',
        effect: '对方压制成功，视为你出的牌，你结束回合；对方要不起，则罚摸 1 张，你继续回合。' }
    ] },
  { id: 'win', short: '胜负', title: '胜负与淘汰',
    entries: [
      { name: '先出完手牌，即获胜', text: '' },
      { name: '手牌数超过 14 张，淘汰', text: '' },
      { name: '最后存活，直接获胜', text: '其他玩家均因爆牌淘汰时，最后剩下的玩家获胜。' }
    ] }
];
const types = [
  { name: '单张', ranks: ['A'], desc: '一张牌。' },
  { name: '对子', ranks: ['8','8'], desc: '两张同点数的牌。' },
  { name: '三不带', ranks: ['7','7','7'], desc: '三张同点数的牌。' },
  { name: '三带一', ranks: ['7','7','7','Q'], desc: '三张同点数的牌，带一张单牌。' },
  { name: '三带一对', ranks: ['7','7','7','Q','Q'], desc: '三张同点数的牌，带一对。' },
  { name: '顺子', ranks: ['5','6','7','8','9'], desc: '至少 5 张连续点数的牌。' },
  { name: '连对', ranks: ['5','5','6','6','7','7'], desc: '至少 3 对连续点数的牌。' },
  { name: '纯飞机', ranks: ['5','5','5','6','6','6'], desc: '连续点数的三张组合。' },
  { name: '飞机带单', ranks: ['5','5','5','6','6','6','8','J'], desc: '连续三张组合，每组带一张单牌。' },
  { name: '飞机带对', ranks: ['5','5','5','6','6','6','8','8','J','J'], desc: '连续三张组合，每组带一对。' },
  { name: '炸弹', ranks: ['8','8','8','8'], desc: '四张同点数的牌。' },
  { name: '王炸', ranks: ['小王','大王'], desc: '大小王一起打出。' }
];

export const RuleText = defineComponent({
  name: 'RuleText',
  props: { text: { type: String, default: '' } },
  setup: (props) => () => h('span', props.text.split(/(\d+\s*张)/g).map(part =>
    /^\d+\s*张$/.test(part) ? h('strong', part.replace(/(\d+)\s*张/, '$1 张')) : part)),
});

function findRules(query) {
  const keyword = query.trim().toLowerCase();
  const results = [];
  chapters.forEach((chapter, chapterIndex) => chapter.entries.forEach((entry, entryIndex) => {
    const text = chapter.title + entry.name + entry.text + (entry.effect || '') + (entry.note || '') + (entry.tag || '');
    if (!keyword || text.toLowerCase().includes(keyword)) {
      results.push({ chapterIndex, entryIndex, section: chapter.short, name: entry.name });
    }
  }));
  if (keyword) types.forEach((type, typeIndex) => {
    if ((type.name + type.desc).includes(keyword)) {
      results.push({ chapterIndex: 0, entryIndex: 1, typeIndex, section: chapters[0].short, name: type.name });
    }
  });
  return results;
}

export function useRulesDetailPop() {
  const pageDialog = ref(null), searchDialog = ref(null), searchInput = ref(null);
  const openChapter = ref(1), entryIndex = ref(0), typeIndex = ref(5);
  const drawn = ref(false), query = ref(''), announcement = ref('');
  const type = computed(() => types[typeIndex.value]);
  const hand = computed(() => ['3','5','5','8','8','J','Q','A'].concat(drawn.value ? ['K','6'] : []));
  const results = computed(() => findRules(query.value));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let opener, searchOpener;

  function entriesFor(chapter) {
    const entries = chapter.entries.map((entry, index) => ({ entry, index }));
    return ['skills', 'tricks'].includes(chapter.id) ? entries.filter(item => item.index === entryIndex.value) : entries;
  }
  function toggleChapter(index) {
    if (openChapter.value === index) { openChapter.value = null; return; }
    openChapter.value = index;
    entryIndex.value = 0;
    drawn.value = false;
    announcement.value = chapters[index].title;
  }
  function selectEntry(index) {
    entryIndex.value = index;
    announcement.value = chapters[openChapter.value].entries[index].name;
  }
  function animateCards(selector, drawOnly = false) {
    if (motion.matches) return;
    pageDialog.value.querySelectorAll(selector).forEach((element, index) => {
      const start = drawOnly ? 'translate(20px,-28px) rotate(8deg)' : 'translateY(7px) rotate(-3deg)';
      element.animate([{ transform: start }, { transform: 'none' }], {
        duration: drawOnly ? 220 : 180, delay: index * (drawOnly ? 50 : 12), easing: 'ease-out',
      });
    });
  }
  async function selectType(index) {
    typeIndex.value = index;
    announcement.value = types[index].name + '，' + types[index].desc;
    await nextTick();
    animateCards('.type-card-row .playing-card');
  }
  async function demonstratePass() {
    drawn.value = !drawn.value;
    await nextTick();
    if (drawn.value) animateCards('.drawn-card', true);
  }
  async function openSearch() {
    searchOpener = document.activeElement;
    query.value = '';
    await nextTick();
    searchDialog.value.showModal();
    searchInput.value.focus();
  }
  function closeSearch() {
    searchDialog.value?.close();
    if (searchOpener?.isConnected) searchOpener.focus({ preventScroll: true });
  }
  function dismissOutside(event) {
    if (event.target !== searchDialog.value) return;
    const rect = searchDialog.value.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSearch();
  }
  async function selectResult(result) {
    openChapter.value = result.chapterIndex;
    entryIndex.value = result.entryIndex;
    if (result.typeIndex !== undefined) typeIndex.value = result.typeIndex;
    drawn.value = false;
    closeSearch();
    await nextTick();
    const selected = pageDialog.value.querySelector('[data-rule-entry="' + result.entryIndex + '"]');
    const entry = chapters[result.chapterIndex].entries[result.entryIndex];
    if (query.value.trim() && entry.note?.toLowerCase().includes(query.value.trim().toLowerCase())) {
      const note = selected?.querySelector('.fine-print');
      if (note) note.open = true;
    }
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
  function cancelAnimations(event) {
    if (event.matches) pageDialog.value?.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
  }
  function chapterShortcut(event) {
    if (searchDialog.value?.open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const index = Math.max(0, Math.min(chapters.length - 1, (openChapter.value ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)));
      if (index !== openChapter.value) toggleChapter(index);
      nextTick(() => pageDialog.value.querySelector('#pop-reading-' + index)?.focus({ preventScroll: true }));
    }
  }
  onMounted(() => {
    opener = document.activeElement;
    pageDialog.value.showModal();
    pageDialog.value.querySelector('.back-button').focus({ preventScroll: true });
    motion.addEventListener('change', cancelAnimations);
  });
  onBeforeUnmount(() => {
    motion.removeEventListener('change', cancelAnimations);
    searchDialog.value?.close();
    pageDialog.value?.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    pageDialog.value?.close();
    const fallback = [...document.querySelectorAll('.pop-lobby-footer button')].find(button => button.textContent.includes('游戏规则'));
    if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
    else fallback?.focus({ preventScroll: true });
  });
  const cardSuit = (rank, index) => ['小王','大王'].includes(rank) ? '' : ['♠','♥','♣','♦'][index % 4];
  const redCard = (rank, index) => ['小王','大王'].includes(rank) ? rank === '大王' : index % 2 === 1;
  return { chapters, types, pageDialog, searchDialog, searchInput, openChapter, entryIndex, typeIndex, drawn, query, announcement,
    type, hand, results, entriesFor, toggleChapter, selectEntry, selectType, demonstratePass, openSearch, closeSearch,
    dismissOutside, selectResult, chapterShortcut, cardSuit, redCard };
}
