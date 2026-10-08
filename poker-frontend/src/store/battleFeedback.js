// Presentation only. The server remains the authority for card and skill rules.
export const CAVALRY_TIMING = Object.freeze({ swingStart: .17, swingDuration: .20, chargeStart: .43, duration: 3200 });
const SKILLS = {
  LUANJIAN: { kind: "arrows", title: "乱箭", tone: "gold", duration: 2400 },
  GUANXING: { kind: "stars", title: "观星", tone: "jade", duration: 2400 },
  GUSHOU: { kind: "shield", title: "固守", tone: "gold", duration: 1900 },
  KUROU: { kind: "blood", title: "苦肉", tone: "crimson", duration: 1500 },
  GUIXIN: { kind: "unity", title: "归心", tone: "jade", duration: 2000 },
};
const SCROLLS = {
  WJQF: { ...SKILLS.LUANJIAN, title: "万箭齐发" },
  NMRQ: { kind: "invasion", title: "南蛮入侵", tone: "crimson", duration: 3200 },
  WGFD: { kind: "harvest", title: "五谷丰登", tone: "jade", duration: 1900 },
  JDSR: { kind: "sword", title: "借刀杀人", tone: "gold", duration: 1600 },
};
const SCROLL_NAMES = { 万箭齐发: "WJQF", 南蛮入侵: "NMRQ", 五谷丰登: "WGFD", 借刀杀人: "JDSR" };
const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "小王", "大王"];
const cardEffect = (kind, title, tone = "gold", duration = 1300) => ({ kind, title, tone, duration });
const consecutive = (weights) => weights.every((weight, i) => i === 0 || weight === weights[i - 1] + 1);

export function getCardFeedback(cards) {
  if (!Array.isArray(cards) || !cards.length || cards.some((card) => !card || card.suit === "SCROLL")) return null;
  const counts = new Map();
  for (const card of cards) {
    const weight = RANKS.indexOf(String(card.rank)) + 1;
    if (!weight) return null;
    counts.set(weight, (counts.get(weight) || 0) + 1);
  }
  const size = cards.length;
  const weights = [...counts.keys()].sort((a, b) => a - b);
  const freqs = [...counts.values()].sort((a, b) => b - a);
  if (size === 2 && counts.has(14) && counts.has(15)) return cardEffect("rocket", "王炸", "crimson", 3000);
  if (size === 4 && freqs[0] === 4) return cardEffect("bomb", "炸弹", "crimson", 2400);
  if (size >= 5 && freqs[0] === 1 && weights.at(-1) <= 12 && consecutive(weights)) return cardEffect("straight", "顺子");
  if (size >= 6 && freqs.every((n) => n === 2) && weights.at(-1) <= 12 && consecutive(weights)) return cardEffect("straight-pair", "连对");
  const triples = weights.filter((weight) => counts.get(weight) >= 3);
  let run = 1;
  let longest = 1;
  for (let i = 1; i < triples.length; i++) {
    run = triples[i] - triples[i - 1] === 1 && triples[i] !== 13 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  // Match the current server's consecutive triple/wing count, never label a four-card group as a bomb.
  if (longest >= 2 && [3, 4, 5].some((n) => size === longest * n)) return cardEffect("airplane", "飞机", "gold", 2500);
  return null;
}

export function createFeedbackDirector(now = Date.now) {
  const previous = new Map();
  return (message) => {
    if (!message) return null;
    const { event, userId } = message;
    if (["ROOM_RESET", "GAME_STARTED", "GAME_ABORTED"].includes(event)) previous.clear();
    let effect = null;
    if (event === "TIEQI_JUDGE") {
      effect = { kind: "judgement", title: "铁骑", tone: "gold", duration: 1900, success: message.success === true, maxRedWeight: message.maxRedWeight };
    } else if (event === "SKILL_USED") effect = SKILLS[message.skillName];
    else if (event === "SKILL_AWAKEN" && message.skillName === "KUROU") {
      effect = { kind: "awakening", title: "苦肉 · 觉醒", tone: "crimson", duration: 2600, replaces: "blood" };
    } else if (event === "PLAYER_REPLACED") effect = { kind: "balance", title: "制衡", tone: "jade", duration: 1500 };
    else if (event === "AOE_PLAYED") effect = SCROLLS[SCROLL_NAMES[message.aoeName] || message.aoeName];
    else if (event === "CARDS_PLAYED") {
      effect = message.cards?.length === 1 && message.cards[0]?.suit === "SCROLL"
        ? SCROLLS[message.cards[0].rank] : getCardFeedback(message.cards);
      if (!effect && message.cards?.length && message.cards.every((card) => card && card.suit !== "SCROLL")) {
        effect = { kind: "card", title: "", tone: "gold", duration: 600 };
      }
    }
    if (!effect) return null;
    const timestamp = now();
    const key = `${userId}:${effect.kind}`;
    const last = previous.get(key);
    // Some actions have both CARDS_PLAYED and AOE_PLAYED broadcasts. Only coalesce complementary events.
    if (last && last.event !== event && timestamp - last.at < 900) return null;
    previous.set(key, { event, at: timestamp });
    for (const [oldKey, entry] of previous) if (timestamp - entry.at > 5000) previous.delete(oldKey);
    return { ...effect, userId, card: message.card, suppressed: message.suppressed || [] };
  };
}
