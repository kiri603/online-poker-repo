<template src="./WaitingRoomPop.html"></template>
<script setup>
import { reactive, ref } from 'vue';
import PlayerAvatar from '@/components/PlayerAvatar.vue';
import SettingsButton from '@/components/SettingsButton.vue';
import GardenCardPlay from './GardenCardPlay.vue';
import { useGardenRoom } from './useGardenRoom.js';
const shell = ref(null);
const room = reactive(useGardenRoom(shell));
</script>
<style scoped src="./WaitingRoomPop.css"></style>
