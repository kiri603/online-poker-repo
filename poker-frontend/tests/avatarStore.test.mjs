import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

function setup() {
  const source = readFileSync(new URL("../src/store/avatarStore.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/export /g, "");
  const state = {
    avatarCatalog: JSON.parse(readFileSync(new URL("../public/images/avatars/catalog.json", import.meta.url), "utf8")),
    ref: (value) => ({ value }),
    authUser: { value: { username: "owner", guest: false } },
    canUseSocial: { value: true },
    socialOverview: { value: { avatar: "/old.png", notificationCount: 2 } },
    socialProfile: { value: { userId: "owner", self: true, avatarId: "old", avatar: "/old.png" } },
    response: { ok: true, json: async () => ({ id: "general", url: "/images/avatars/general.png" }) },
    requests: [],
  };
  state.apiFetch = async (path, options) => { state.requests.push({ path, options }); return state.response; };
  const context = vm.createContext(state);
  vm.runInContext(source + "\nglobalThis.store = { avatarOptions, selectedAvatarId, avatarError, avatarMessage, avatarSaving, loadAvatarOptions, saveSelectedAvatar };", context);
  context.store.avatarOptions.value = [{ id: "general", url: "/images/avatars/general.png" }];
  context.store.selectedAvatarId.value = "general";
  return context;
}

test("saving updates the owner's profile and account image only after success", async () => {
  const context = setup();
  await context.store.saveSelectedAvatar();
  assert.equal(context.requests[0].path, "/api/avatars/me");
  assert.equal(context.requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(context.requests[0].options.body), { avatarId: "general" });
  assert.equal(context.socialProfile.value.avatarId, "general");
  assert.equal(context.socialOverview.value.avatar, "/images/avatars/general.png");
  assert.equal(context.socialOverview.value.notificationCount, 2);
  assert.equal(context.store.avatarMessage.value, "头像已保存");
});

test("failed saves retain the stored avatar and show the server error", async () => {
  const context = setup();
  context.response = { ok: false, json: async () => ({ message: "请选择已有头像" }) };
  await context.store.saveSelectedAvatar();
  assert.equal(context.socialProfile.value.avatarId, "old");
  assert.equal(context.socialOverview.value.avatar, "/old.png");
  assert.equal(context.store.avatarError.value, "请选择已有头像");
  assert.equal(context.store.avatarSaving.value, false);
});

test("guests do not send save requests", async () => {
  const context = setup();
  context.canUseSocial.value = false;
  await context.store.saveSelectedAvatar();
  assert.equal(context.requests.length, 0);
});

test("a missing backend avatar endpoint explains how to recover", async () => {
  const context = setup();
  context.store.avatarOptions.value = [];
  context.response = { ok: false, status: 404, json: async () => ({ error: "Not Found" }) };
  await context.store.loadAvatarOptions();
  assert.equal(context.store.avatarError.value, "头像接口尚未启用，请重启本地后端或更新服务后重试");
  assert.equal(context.store.avatarOptions.value.length, 0);
  context.response = { ok: true, json: async () => [{ id: "general", url: "/images/avatars/general.png" }] };
  await context.store.loadAvatarOptions();
  assert.equal(context.store.avatarOptions.value.length, 1);
  assert.equal(context.store.avatarOptions.value[0].name, "将军");
  assert.equal(context.store.avatarError.value, "");
});

test("a late save cannot change another account or a friend's displayed profile", async () => {
  const context = setup();
  let release;
  context.apiFetch = () => new Promise((resolve) => { release = resolve; });
  const saving = context.store.saveSelectedAvatar();
  context.authUser.value = { username: "other", guest: false };
  release(context.response);
  await saving;
  assert.equal(context.socialOverview.value.avatar, "/old.png");
  context.authUser.value = { username: "owner", guest: false };
  context.socialProfile.value = { userId: "friend", self: false, avatarId: "friend-avatar" };
  context.apiFetch = async () => context.response;
  await context.store.saveSelectedAvatar();
  assert.equal(context.socialProfile.value.avatarId, "friend-avatar");
});
