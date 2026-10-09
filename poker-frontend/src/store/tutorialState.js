import { ref } from "vue";
import { createTutorialInvitations } from "../tutorial/tutorialInvitations.js";
import { getTutorialLesson } from "../tutorial/tutorialLessons.js";

const storage = (name) => { try { return window[name]; } catch { return undefined; } };
export const tutorialInvitations = createTutorialInvitations({
  localStorage: storage("localStorage"), sessionStorage: storage("sessionStorage"),
});
export const showTutorial = ref(false);
export const tutorialKind = ref("basic");
export const showTutorialSelector = ref(false);
export const queueTutorialInvitation = (user) => tutorialInvitations.queue(user);
export const openTutorial = (kind = "basic") => {
  getTutorialLesson(kind);
  tutorialKind.value = kind; showTutorialSelector.value = false; showTutorial.value = true;
};
export const openTutorialSelection = () => { showTutorialSelector.value = true; };
export const closeTutorialSelection = () => { showTutorialSelector.value = false; };
export const closeTutorial = () => { showTutorial.value = false; showTutorialSelector.value = false; };
