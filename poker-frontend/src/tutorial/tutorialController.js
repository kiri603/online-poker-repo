import { getTutorialLesson } from "./tutorialLessons.js";

const sameCards = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));
export function createTutorialController({ kind = "basic", onChange = () => {}, onAction = () => {} } = {}) {
  const lesson = getTutorialLesson(kind);
  let disposed = false;
  const pauses = new Set();
  const initial = () => ({ match: lesson.createMatch(), stepIndex: 0, phase: "dialogue", dialoguePage: 0,
    selected: [], demoIndex: 0, paused: pauses.size > 0, lastEvent: null, error: "" });
  let state = initial();
  let eventId = 0;
  const publish = (patch) => { state = { ...state, ...patch }; onChange(state); };
  const step = () => lesson.steps[state.stepIndex];
  const active = () => !disposed && !state.paused;
  const fail = (error) => { publish({ phase: "error", error: error.message || "教学脚本异常", selected: [] }); return false; };
  const settle = (move) => {
    const match = lesson.applyMove(state.match, move);
    const event = { ...move, id: ++eventId };
    publish({ match, selected: [], lastEvent: event });
    onAction(event, match);
  };
  const canExecute = (action, ids = state.selected) => active() && state.phase === "operation" &&
    action === step().action && lesson.canAct(state.match, "you", action) && sameCards(ids, step().cards);
  return {
    get state() { return state; },
    canExecute,
    canSelect(id) { return active() && state.phase === "operation" && lesson.canAct(state.match, "you", step().action) && step().cards.includes(id); },
    toggleCard(id) {
      if (!this.canSelect(id)) return false;
      publish({ selected: state.selected.includes(id) ? state.selected.filter((c) => c !== id) : [...state.selected, id] });
      return true;
    },
    continueDialogue() {
      if (!active() || state.phase !== "dialogue") return false;
      if (state.dialoguePage < step().dialogue.length - 1) publish({ dialoguePage: state.dialoguePage + 1 });
      else publish({ phase: "operation" });
      return true;
    },
    explain() {
      if (!active() || state.phase !== "operation") return false;
      publish({ phase: "dialogue", dialoguePage: 0, selected: [] }); return true;
    },
    execute(action, ids = state.selected) {
      if (!canExecute(action, ids)) return false;
      try {
        // Lock before callbacks or presentation code can submit the action again.
        publish({ phase: "demo", demoIndex: 0 });
        settle({ actor: "you", action, cards: [...ids] }); return true;
      } catch (error) { return fail(error); }
    },
    advanceDemo() {
      if (!active() || state.phase !== "demo") return false;
      try {
        const move = step().opponents[state.demoIndex];
        if (move) { settle(move); publish({ demoIndex: state.demoIndex + 1 }); }
        else if (lesson.isComplete(state.match, state.stepIndex)) publish({ phase: "complete" });
        else {
          const nextIndex = state.stepIndex + 1;
          const next = lesson.steps[nextIndex];
          if (!next || !lesson.canAct(state.match, "you", next.action)) throw new Error("教学回合未能按脚本推进");
          publish({ stepIndex: nextIndex, phase: "dialogue", dialoguePage: 0, selected: [], lastEvent: null });
        }
        return true;
      } catch (error) { return fail(error); }
    },
    setPaused(reason, paused) {
      if (disposed) return;
      if (paused) pauses.add(reason); else pauses.delete(reason);
      publish({ paused: pauses.size > 0 });
    },
    restart() {
      if (disposed) return false;
      publish(initial()); return true;
    },
    dispose() { disposed = true; },
  };
}
