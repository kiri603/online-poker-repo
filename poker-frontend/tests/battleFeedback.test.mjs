import test from "node:test";
import assert from "node:assert/strict";
import { createFeedbackDirector, getCardFeedback } from "../src/store/battleFeedback.js";

const cards = (ranks) => ranks.map((rank) => ({ rank, suit: "♠", weight: Number(rank) - 2 }));

test("cavalry charge only follows a successful server judgement", () => {
  const direct = createFeedbackDirector();
  assert.equal(direct({ event: "TIEQI_JUDGE", userId: "p1", success: false }).kind, "judgement");
  const judgement = direct({ event: "TIEQI_JUDGE", userId: "p1", success: true });
  assert.equal(judgement.kind, "judgement");
  assert.equal(judgement.success, true);
  assert.equal(direct({ event: "SYNC_STATE", settings: { tieqiJudgeSuccess: true } }), null);
});

test("complementary skill and scroll events produce one volley, but later casts still play", () => {
  let now = 0;
  const direct = createFeedbackDirector(() => now);
  assert.equal(direct({ event: "SKILL_USED", skillName: "LUANJIAN", userId: "p1" }).kind, "arrows");
  now = 100;
  assert.equal(direct({ event: "AOE_PLAYED", aoeName: "万箭齐发", userId: "p1" }), null);
  now = 1500;
  assert.equal(direct({ event: "SKILL_USED", skillName: "LUANJIAN", userId: "p1" }).kind, "arrows");
});

test("borrowed sword complementary broadcasts do not duplicate its performance", () => {
  const direct = createFeedbackDirector(() => 100);
  const event = { event: "CARDS_PLAYED", userId: "p1", cards: [{ suit: "SCROLL", rank: "JDSR" }] };
  assert.equal(direct(event).kind, "sword");
  assert.equal(direct({ event: "AOE_PLAYED", aoeName: "借刀杀人", userId: "p1" }), null);
});

test("all seven skills and four scrolls have distinct feedback", () => {
  const direct = createFeedbackDirector(() => 100);
  for (const skillName of ["LUANJIAN", "GUANXING", "GUSHOU", "KUROU", "GUIXIN"]) {
    assert.ok(direct({ event: "SKILL_USED", skillName, userId: skillName }));
  }
  assert.equal(direct({ event: "PLAYER_REPLACED", userId: "p1" }).kind, "balance");
  for (const aoeName of ["万箭齐发", "南蛮入侵", "五谷丰登", "借刀杀人"]) {
    assert.ok(direct({ event: "AOE_PLAYED", aoeName, userId: aoeName }));
  }
  assert.equal(direct({ event: "SKILL_AWAKEN", skillName: "KUROU", userId: "p1" }).kind, "awakening");
});

test("unsupported messages and malformed cards never create combat feedback", () => {
  const direct = createFeedbackDirector();
  for (const event of ["SYNC_STATE", "SYNC_HAND", "ERROR", "PLAYER_PASSED", "ROOM_RESET"]) {
    assert.equal(direct({ event }), null);
  }
  assert.equal(getCardFeedback(null), null);
  assert.equal(getCardFeedback([]), null);
  assert.equal(getCardFeedback(cards([3, 4, 6, 8, 9])), null);
  assert.equal(getCardFeedback(cards([3, 3, 3, 3, 4, 4])), null);
  assert.equal(getCardFeedback([{ suit: "SCROLL", rank: "WJQF" }]), null);
});

test("special card feedback separates bombs, rockets, sequences and airplanes", () => {
  assert.equal(getCardFeedback(cards([3, 3, 3, 3])).kind, "bomb");
  assert.equal(getCardFeedback([{ rank: "小王", suit: "JOKER" }, { rank: "大王", suit: "JOKER" }]).kind, "rocket");
  assert.equal(getCardFeedback(cards([3, 4, 5, 6, 7])).kind, "straight");
  assert.equal(getCardFeedback(cards([3, 3, 4, 4, 5, 5])).kind, "straight-pair");
  assert.equal(getCardFeedback(cards([3, 3, 3, 4, 4, 4])).kind, "airplane");
  assert.equal(getCardFeedback(cards([3, 3, 3, 4, 4, 4, 5, 6])).kind, "airplane");
  assert.equal(getCardFeedback(cards([3, 3, 3, 7, 7, 7])), null);
});
