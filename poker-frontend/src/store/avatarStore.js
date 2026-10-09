import { ref } from "vue";
import { authUser } from "./gameState.js";
import { canUseSocial, socialOverview, socialProfile } from "./socialStore.js";
import { apiFetch } from "./serverConfig.js";
import avatarCatalog from "../../public/images/avatars/catalog.json";

const avatarNames = new Map(avatarCatalog.avatars.map((avatar) => [avatar.id, avatar.name]));

export const avatarOptions = ref([]);
export const selectedAvatarId = ref("");
export const avatarLoading = ref(false);
export const avatarSaving = ref(false);
export const avatarError = ref("");
export const avatarMessage = ref("");

const requestJson = async (path, options) => {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) throw new Error("头像接口尚未启用，请重启本地后端或更新服务后重试");
  if (!response.ok) throw new Error(data.message || "头像操作失败，请重试");
  return data;
};

export const loadAvatarOptions = async () => {
  if (!canUseSocial.value || avatarLoading.value || avatarOptions.value.length) return;
  avatarLoading.value = true;
  avatarError.value = "";
  try {
    const data = await requestJson("/api/avatars", { method: "GET" });
    if (!Array.isArray(data) || !data.length) throw new Error("头像列表加载失败，请重试");
    avatarOptions.value = data.map((avatar) => ({ ...avatar, name: avatarNames.get(avatar.id) || avatar.name }));
  } catch (error) {
    avatarError.value = error.message;
  } finally {
    avatarLoading.value = false;
  }
};

export const saveSelectedAvatar = async () => {
  if (!canUseSocial.value || avatarSaving.value) return;
  avatarError.value = "";
  avatarMessage.value = "";
  if (!avatarOptions.value.some((avatar) => avatar.id === selectedAvatarId.value)) {
    avatarError.value = "请选择已有头像";
    return;
  }
  const username = authUser.value.username;
  avatarSaving.value = true;
  try {
    const avatar = await requestJson("/api/avatars/me", {
      method: "POST",
      body: JSON.stringify({ avatarId: selectedAvatarId.value }),
    });
    if (!canUseSocial.value || authUser.value?.username !== username) return;
    socialOverview.value = { ...socialOverview.value, avatar: avatar.url };
    if (socialProfile.value?.userId === username && socialProfile.value.self !== false) {
      socialProfile.value = { ...socialProfile.value, avatarId: avatar.id, avatar: avatar.url };
    }
    avatarMessage.value = "头像已保存";
  } catch (error) {
    if (authUser.value?.username === username) avatarError.value = error.message;
  } finally {
    avatarSaving.value = false;
  }
};
