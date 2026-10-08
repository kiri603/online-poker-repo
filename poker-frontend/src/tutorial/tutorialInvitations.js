export function createTutorialInvitations({ localStorage, sessionStorage } = {}) {
  const pending = new Set(), shown = new Set();
  const accountId = (user) => user && !user.guest && user.id != null ? String(user.id) : "";
  const seenKey = (id) => `poker:tutorial-invitation:v1:${id}`;
  const pendingKey = (id) => `poker:tutorial-pending:v1:${id}`;
  const read = (storage, key) => { try { return storage?.getItem(key); } catch { return null; } };
  const write = (storage, key, value) => { try { storage?.setItem(key, value); } catch { /* Use the in-memory marker. */ } };
  return {
    queue(user) {
      const id = accountId(user);
      if (!id || shown.has(id) || read(localStorage, seenKey(id))) return;
      pending.add(id); write(sessionStorage, pendingKey(id), "1");
    },
    shouldOffer(user) {
      const id = accountId(user);
      return !!id && !shown.has(id) && !read(localStorage, seenKey(id)) &&
        (pending.has(id) || read(sessionStorage, pendingKey(id)) === "1");
    },
    markShown(user) {
      const id = accountId(user);
      if (!id) return;
      shown.add(id); pending.delete(id); write(localStorage, seenKey(id), "1");
      try { sessionStorage?.removeItem(pendingKey(id)); } catch { /* Storage may be disabled. */ }
    },
  };
}
