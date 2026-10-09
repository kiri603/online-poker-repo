import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import { ref, computed } from "vue";

test("waiting seats use the account avatar for self and the server avatar for opponents", () => {
  const source = readFileSync(new URL("../src/views/WaitingRoom/WaitingRoom.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "")
    .replace(/export\s*\{[\s\S]*?\};/g, "");
  const state = {
    ref, computed,
    userId: ref("owner"), ownerId: ref("owner"), isReady: ref(true), isSpectator: ref(false),
    canUseSocial: ref(true), socialOverview: ref({ avatar: "/images/avatars/hoodie-girl-smug.png" }),
    otherPlayers: ref([{ userId: "friend", avatar: "/images/avatars/general.png" }]),
  };
  const context = vm.createContext(state);
  vm.runInContext(source + "\nglobalThis.seats = { displayPlayers, avatarForPlayer };", context);
  assert.equal(context.seats.avatarForPlayer(context.seats.displayPlayers.value[0], 0), "/images/avatars/hoodie-girl-smug.png");
  assert.equal(context.seats.avatarForPlayer(context.seats.displayPlayers.value[1], 1), "/images/avatars/general.png");
  state.socialOverview.value = { avatar: "/images/avatars/alan-walker-smug.png" };
  assert.equal(context.seats.avatarForPlayer(context.seats.displayPlayers.value[0], 0), "/images/avatars/alan-walker-smug.png");
  state.canUseSocial.value = false;
  assert.equal(context.seats.avatarForPlayer(context.seats.displayPlayers.value[0], 0), "/images/emojis/01_xiao.png");
});
