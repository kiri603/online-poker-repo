<template src="./RulesDetailPop.html"></template>

<script setup>
import { RuleText, useRulesDetailPop } from './RulesDetailPop.js';

const emit = defineEmits(['close']);
const {
  chapters, types, pageDialog, searchDialog, searchInput, openChapter, entryIndex, typeIndex,
  drawn, query, announcement, type, hand, results, entriesFor, toggleChapter, selectEntry,
  selectType, demonstratePass, openSearch, closeSearch, dismissOutside, selectResult,
  chapterShortcut, cardSuit, redCard,
} = useRulesDetailPop();

const _exposeToHtml = {
  emit, RuleText, chapters, types, pageDialog, searchDialog, searchInput, openChapter, entryIndex,
  typeIndex, drawn, query, announcement, type, hand, results, entriesFor, toggleChapter, selectEntry,
  selectType, demonstratePass, openSearch, closeSearch, dismissOutside, selectResult,
  chapterShortcut, cardSuit, redCard,
};
</script>

<style scoped src="./RulesDetailPop.css"></style>
