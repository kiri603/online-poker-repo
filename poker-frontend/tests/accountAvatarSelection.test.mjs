import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import { ref, computed, watch, nextTick } from "vue";

test("profile refresh preserves an unsaved selection and the save confirmation", async () => {
  const source = readFileSync(new URL("../src/views/Social/AccountHub.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "")
    .replace(/export\s*\{[\s\S]*?\};/g, "");
  const state = {
    ref, computed, watch, nextTick,
    socialProfile: ref({ userId: "owner", self: true, avatarId: "xiaotao-smile" }),
    socialProfileVisible: ref(false),
    socialActiveTab: ref("account"),
    selectedAvatarId: ref(""),
    avatarError: ref(""),
    avatarMessage: ref(""),
    loadAvatarOptions: async () => {},
  };
  vm.runInContext(source, vm.createContext(state));
  state.socialProfileVisible.value = true;
  await nextTick();
  assert.equal(state.selectedAvatarId.value, "xiaotao-smile");
  state.selectedAvatarId.value = "hoodie-girl-smug";
  state.avatarMessage.value = "头像已保存";
  state.socialProfile.value = { ...state.socialProfile.value, avatarId: "hoodie-girl-smug" };
  await nextTick();
  assert.equal(state.avatarMessage.value, "头像已保存");
  state.selectedAvatarId.value = "general";
  state.socialProfile.value = { ...state.socialProfile.value, level: 2 };
  await nextTick();
  assert.equal(state.selectedAvatarId.value, "general");
});
