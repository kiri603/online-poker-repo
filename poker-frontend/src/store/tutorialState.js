import { ref } from "vue";
import { createTutorialInvitations } from "../tutorial/tutorialInvitations.js";

const storage = (name) => { try { return window[name]; } catch { return undefined; } };
export const tutorialInvitations = createTutorialInvitations({
  localStorage: storage("localStorage"), sessionStorage: storage("sessionStorage"),
});
export const showTutorial = ref(false);
export const queueTutorialInvitation = (user) => tutorialInvitations.queue(user);
export const openTutorial = () => { showTutorial.value = true; };
export const closeTutorial = () => { showTutorial.value = false; };
