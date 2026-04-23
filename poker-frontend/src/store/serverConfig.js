const TAB_AUTH_TOKEN_KEY = "poker:tab-auth-token";

// In Vite dev mode we route HTTP + WebSocket traffic through the dev server
// (which proxies to the real backend defined in vite.config.js). This keeps
// requests same-origin so cookies / auth tokens work without CORS tweaks and
// allows local UI testing even when no Java backend is running on :8080.
const IS_DEV = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

export const getServerHost = () => {
  if (IS_DEV) {
    return window.location.host;
  }
  const currentHost = window.location.hostname;
  return `${currentHost}:8080`;
};

export const getHttpBaseUrl = () => {
  if (IS_DEV) {
    return window.location.origin;
  }
  return `http://${getServerHost()}`;
};

export const getWsBaseUrl = () => {
  if (IS_DEV) {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}`;
  }
  return `ws://${getServerHost()}`;
};

export const getTabAuthToken = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.sessionStorage.getItem(TAB_AUTH_TOKEN_KEY) || "";
};

export const setTabAuthToken = (token) => {
  if (typeof window === "undefined") {
    return;
  }
  if (!token) {
    window.sessionStorage.removeItem(TAB_AUTH_TOKEN_KEY);
    return;
  }
  window.sessionStorage.setItem(TAB_AUTH_TOKEN_KEY, token);
};

export const clearTabAuthToken = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(TAB_AUTH_TOKEN_KEY);
};

export const apiFetch = async (path, options = {}) => {
  const tabToken = getTabAuthToken();
  const response = await fetch(`${getHttpBaseUrl()}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(tabToken ? { "X-Poker-Auth-Token": tabToken } : {}),
      ...(options.headers || {}),
    },
  });
  return response;
};
