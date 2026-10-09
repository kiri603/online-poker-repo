import test from "node:test";
import assert from "node:assert/strict";
import { showTutorial, tutorialKind, showTutorialSelector, openTutorial, closeTutorial,
  openTutorialSelection, closeTutorialSelection } from "../src/store/tutorialState.js";

test("selection, direct invitations and switching lessons maintain separate entry states", () => {
  closeTutorial(); openTutorialSelection();
  assert.equal(showTutorialSelector.value, true);
  assert.equal(showTutorial.value, false);
  openTutorial("advanced");
  assert.equal(showTutorialSelector.value, false);
  assert.equal(showTutorial.value, true);
  assert.equal(tutorialKind.value, "advanced");
  closeTutorial(); openTutorial();
  assert.equal(tutorialKind.value, "basic");
  openTutorial("advanced");
  assert.equal(tutorialKind.value, "advanced");
  assert.throws(() => openTutorial("unknown"));
  assert.equal(tutorialKind.value, "advanced");
  closeTutorial(); openTutorialSelection(); closeTutorialSelection();
  assert.equal(showTutorialSelector.value, false);
  assert.equal(showTutorial.value, false);
});
