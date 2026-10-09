export const CARD_RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const SUITS = ["♠", "♥", "♣", "♦"];
const PLAYERS = ["you", "dragon", "tortoise"];
export const cardId = (card) => card.suit === "JOKER" ? card.rank : card.suit + card.rank;
export const TUTORIAL_SCROLLS = {
  WJQF: { name: "万箭齐发", weight: 16, audio: "skill_wjqf" },
  NMRQ: { name: "南蛮入侵", weight: 17, audio: "skill_nmrq" },
  WGFD: { name: "五谷丰登", weight: 18, audio: "skill_wgfd" },
  JDSR: { name: "借刀杀人", weight: 19, audio: "skill_jdsr" },
};
export const cardLabel = (card) => card.suit === "SCROLL" ? TUTORIAL_SCROLLS[card.rank]?.name || card.rank : cardId(card);

export const createTutorialCard = (id) => {
  if (id.startsWith("SCROLL")) {
    const rank = id.slice(6);
    if (!TUTORIAL_SCROLLS[rank]) throw new Error("未知教学锦囊牌");
    return { suit: "SCROLL", rank, weight: TUTORIAL_SCROLLS[rank].weight };
  }
  if (id === "小王" || id === "大王") return { suit: "JOKER", rank: id, weight: id === "小王" ? 14 : 15 };
  const rank = id.slice(1);
  return { suit: id[0], rank, weight: CARD_RANKS.indexOf(rank) + 1 };
};
const INITIAL_HANDS = {
  you: ["♠3", "♠4", "♥4", "♣5", "♦6", "♠7", "♥8", "♣9"],
  dragon: ["♥5", "♣2", "♣3", "♦3", "♠8", "♦8", "♠A", "♦A"],
  tortoise: ["♠6", "♣4", "♥6", "♦7", "♣8", "♠9", "♣K", "大王"],
};
const DRAW_PREFIX = ["♥J", "♦J", "♥9", "♥3", "♣Q", "♦Q", "♠J", "♠Q", "♥K", "♦K", "♥10"];

export function createTutorialMatch() {
  const assigned = new Set([...Object.values(INITIAL_HANDS).flat(), ...DRAW_PREFIX]);
  const remaining = [...CARD_RANKS.flatMap((rank) => SUITS.map((suit) => suit + rank)), "小王", "大王"]
    .filter((id) => !assigned.has(id));
  return {
    hands: Object.fromEntries(Object.entries(INITIAL_HANDS).map(([id, hand]) => [id, hand.map(createTutorialCard)])),
    deck: [...DRAW_PREFIX, ...remaining].map(createTutorialCard), discard: [], table: [],
    turn: "you", last: "", winner: "", replaced: false,
    statuses: Object.fromEntries(PLAYERS.map((id) => [id, "PLAYING"])),
  };
}

// This local match only evaluates the three patterns used by this lesson.
export function tutorialPattern(cards) {
  const weights = cards.map((c) => c.weight).sort((a, b) => a - b);
  if (weights.length === 1) return { type: "single", weight: weights[0] };
  if (weights.length === 2 && weights[0] === weights[1]) return { type: "pair", weight: weights[0] };
  if (weights.length >= 5 && weights.at(-1) <= 12 && weights.every((w, i) => !i || w === weights[i - 1] + 1))
    return { type: "straight", weight: weights.at(-1) };
  throw new Error("教学脚本包含不合法的牌型");
}

export function validateTutorialDeck(match) {
  const cards = [...Object.values(match.hands).flat(), ...match.deck, ...match.discard, ...match.table, ...(match.wgfdCards || [])];
  const total = match.cardCount || 54;
  if (cards.length !== total || new Set(cards.map(cardId)).size !== total) throw new Error("教学牌堆不一致");
}

export function advanceTutorialTurn(match) {
  const index = PLAYERS.indexOf(match.turn);
  for (let offset = 1; offset <= PLAYERS.length; offset++) {
    const id = PLAYERS[(index + offset) % PLAYERS.length];
    if (match.statuses[id] !== "PLAYING") continue;
    match.turn = id;
    match.replaced = false;
    if (id === match.last) {
      match.discard.push(...match.table);
      match.table = [];
      match.last = "";
    }
    return;
  }
}

export function applyTutorialMove(current, { actor, action, cards = [] }) {
  validateTutorialDeck(current);
  if (current.winner || actor !== current.turn || current.statuses[actor] !== "PLAYING") throw new Error("非当前教学行动者");
  const match = {
    ...current, statuses: { ...current.statuses },
    hands: Object.fromEntries(Object.entries(current.hands).map(([id, hand]) => [id, [...hand]])),
    table: [...current.table], discard: [...current.discard], deck: [...current.deck],
  };
  const draw = (count) => {
    if (match.deck.length < count) throw new Error("教学牌堆不足");
    match.hands[actor].push(...match.deck.splice(0, count));
  };
  if (action === "pass") {
    if (cards.length || !match.table.length || match.last === actor) throw new Error("自由出牌时不能要不起");
    draw(2);
    if (match.hands[actor].length > 14) match.statuses[actor] = "LOST";
    const alive = PLAYERS.filter((id) => match.statuses[id] === "PLAYING");
    if (alive.length === 1) { match.winner = alive[0]; match.statuses[alive[0]] = "WON"; }
    else advanceTutorialTurn(match);
  } else {
    if (!cards.length || new Set(cards).size !== cards.length) throw new Error("教学选牌无效");
    const played = cards.map((id) => match.hands[actor].find((c) => cardId(c) === id));
    if (played.some((c) => !c)) throw new Error("教学手牌中不存在指定卡牌");
    if (action === "replace") {
      if (cards.length !== 1 || match.replaced) throw new Error("制衡每回合限一次，且必须弃置一张牌");
      match.hands[actor] = match.hands[actor].filter((c) => !cards.includes(cardId(c)));
      match.discard.push(...played); draw(1); match.replaced = true;
    } else if (action === "play") {
      const proposed = tutorialPattern(played);
      if (match.table.length && match.last !== actor) {
        const previous = tutorialPattern(match.table);
        if (proposed.type !== previous.type || played.length !== match.table.length || proposed.weight <= previous.weight)
          throw new Error("教学出牌不能压过桌面");
      }
      match.hands[actor] = match.hands[actor].filter((c) => !cards.includes(cardId(c)));
      match.discard.push(...match.table); match.table = played; match.last = actor;
      if (!match.hands[actor].length) { match.winner = actor; match.statuses[actor] = "WON"; }
      else advanceTutorialTurn(match);
    } else throw new Error("未知教学动作");
  }
  validateTutorialDeck(match);
  return match;
}
