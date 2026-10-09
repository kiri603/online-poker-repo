import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import { ref, computed } from "vue";

function setup() {
  let disconnects = 0;
  let nativeConfirmCalls = 0;
  const context = vm.createContext({
    ref, computed,
    disconnectWebSocket: () => { disconnects++; },
    // Embedded browsers can suppress confirm() and return false without a dialog.
    confirm: () => { nativeConfirmCalls++; return false; },
  });
  const source = readFileSync(new URL("../src/views/GameBoard/GameBoard.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "")
    .replace(/export\s*\{[\s\S]*?\};/g, "");
  vm.runInContext(`${source}
    globalThis.actions = {
      exitGame,
      get isOpen() { return typeof showExitConfirm !== "undefined" && showExitConfirm.value; },
      cancel: () => cancelExitGame(),
      confirm: () => confirmExitGame(),
    };`, context);
  return {
    actions: context.actions,
    get disconnects() { return disconnects; },
    get nativeConfirmCalls() { return nativeConfirmCalls; },
  };
}

test("exit opens an in-page confirmation when native confirm is suppressed", () => {
  const t = setup();
  t.actions.exitGame();
  assert.equal(t.actions.isOpen, true);
  assert.equal(t.disconnects, 0);
  assert.equal(t.nativeConfirmCalls, 0);
});

test("cancel keeps the room connected and a later exit opens a fresh confirmation", () => {
  const t = setup();
  t.actions.exitGame();
  t.actions.cancel();
  assert.equal(t.actions.isOpen, false);
  assert.equal(t.disconnects, 0);
  t.actions.exitGame();
  assert.equal(t.actions.isOpen, true);
});

test("confirm leaves once and cannot leave again after cancellation", () => {
  const t = setup();
  t.actions.exitGame();
  t.actions.confirm();
  t.actions.confirm();
  assert.equal(t.actions.isOpen, false);
  assert.equal(t.disconnects, 1);
  t.actions.exitGame();
  t.actions.cancel();
  t.actions.confirm();
  assert.equal(t.disconnects, 1);
});
