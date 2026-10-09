import { CARD_RANKS, TUTORIAL_SCROLLS, cardId, createTutorialCard, applyTutorialMove,
  tutorialPattern, validateTutorialDeck, advanceTutorialTurn } from "./tutorialMatch.js";

const PLAYERS = ["you", "dragon", "tortoise"];
const INITIAL_HANDS = {
  you: ["SCROLLWJQF", "SCROLLWGFD", "SCROLLJDSR", "♠3", "♣4", "♠J", "♥A", "♥7"],
  dragon: ["SCROLLNMRQ", "♣3", "♥3", "♥5", "♥Q", "♠4", "♦4", "♦5"],
  tortoise: ["♦3", "♣6", "♣K", "♠5", "♦6", "♣7", "♦7", "♣8"],
};
const DRAW_PREFIX = ["♣5", "♦8", "♥8", "♥9", "♣10", "♠K", "♥K", "♦9"];

export function createAdvancedTutorialMatch() {
  const assigned = new Set([...Object.values(INITIAL_HANDS).flat(), ...DRAW_PREFIX]);
  const deck = [...CARD_RANKS.flatMap((rank) => ["♠", "♥", "♣", "♦"].map((suit) => suit + rank)),
    "小王", "大王", ...Object.keys(TUTORIAL_SCROLLS).map((rank) => "SCROLL" + rank)];
  const match = {
    cardCount: 58, hands: Object.fromEntries(Object.entries(INITIAL_HANDS).map(([id, hand]) => [id, hand.map(createTutorialCard)])),
    deck: [...DRAW_PREFIX, ...deck.filter((id) => !assigned.has(id))].map(createTutorialCard),
    discard: [], table: [], turn: "you", last: "", winner: "", replaced: false,
    statuses: Object.fromEntries(PLAYERS.map((id) => [id, "PLAYING"])),
    usedScrolls: Object.fromEntries(PLAYERS.map((id) => [id, false])),
    currentAoeType: null, pendingAoePlayers: [], aoeInitiator: "", wgfdCards: [], wgfdQueue: [],
    jdsrTarget: null, jdsrInitiator: null,
  };
  validateTutorialDeck(match);
  return match;
}

export function canAdvancedTutorialAct(match, actor, action) {
  if (match.winner || match.statuses[actor] !== "PLAYING") return false;
  if (action === "discardAoe" || action === "respondAoe")
    return ["WJQF", "NMRQ"].includes(match.currentAoeType) && match.pendingAoePlayers.includes(actor);
  if (action === "confirmWgfd") return match.currentAoeType === "WGFD" && match.pendingAoePlayers[0] === actor;
  return match.turn === actor && !match.currentAoeType && !match.pendingAoePlayers.length &&
    ["play", "pass", "replace"].includes(action) && !(action === "replace" && match.jdsrTarget);
}

// Only the tutorial's card patterns are evaluated locally. Scroll rules mirror GameService.
export function applyAdvancedTutorialMove(current, { actor, action, cards = [] }) {
  validateTutorialDeck(current);
  if (!Array.isArray(cards) || new Set(cards).size !== cards.length) throw new Error("教学选牌无效");
  if (!canAdvancedTutorialAct(current, actor, action)) throw new Error("当前教学阶段不能执行此动作");
  const match = {
    ...current, hands: Object.fromEntries(Object.entries(current.hands).map(([id, hand]) => [id, [...hand]])),
    statuses: { ...current.statuses }, usedScrolls: { ...current.usedScrolls },
    deck: [...current.deck], discard: [...current.discard], table: [...current.table],
    pendingAoePlayers: [...current.pendingAoePlayers], wgfdCards: [...current.wgfdCards], wgfdQueue: [...current.wgfdQueue],
  };
  const takeFromHand = (id) => {
    const index = match.hands[actor].findIndex((c) => cardId(c) === id);
    if (index < 0) throw new Error("教学手牌中不存在指定卡牌");
    return match.hands[actor].splice(index, 1)[0];
  };
  const draw = (id, count) => {
    if (match.deck.length < count) throw new Error("教学牌堆不足");
    match.hands[id].push(...match.deck.splice(0, count));
  };
  const checkStatus = (id) => {
    if (match.hands[id].length > 14) match.statuses[id] = "LOST";
    else if (!match.hands[id].length) { match.statuses[id] = "WON"; match.winner = id; }
    const alive = PLAYERS.filter((id) => match.statuses[id] === "PLAYING");
    if (!match.winner && alive.length === 1) { match.winner = alive[0]; match.statuses[alive[0]] = "WON"; }
  };
  const endResolution = () => {
    const initiator = match.aoeInitiator;
    match.currentAoeType = null; match.pendingAoePlayers = []; match.aoeInitiator = "";
    if (match.statuses[initiator] === "PLAYING") match.turn = initiator;
    else if (!match.winner) { advanceTutorialTurn(match); match.usedScrolls[match.turn] = false; }
  };
  if (action === "discardAoe" || action === "respondAoe") {
    if (action === "discardAoe") {
      if (cards.length !== 1) throw new Error("响应锦囊必须弃置一张牌");
      const card = takeFromHand(cards[0]);
      const red = match.currentAoeType === "NMRQ";
      if (!(red ? ["♥", "♦"].includes(card.suit) || (card.suit === "JOKER" && card.rank === "大王")
        : ["♠", "♣"].includes(card.suit) || (card.suit === "JOKER" && card.rank === "小王")))
        throw new Error("弃置的卡牌不符合锦囊要求");
      match.discard.push(card);
    } else {
      if (cards.length) throw new Error("接受罚牌时不能选牌");
      draw(actor, 2);
    }
    checkStatus(actor);
    match.pendingAoePlayers = match.pendingAoePlayers.filter((id) => id !== actor);
    if (!match.pendingAoePlayers.length) endResolution();
  } else if (action === "confirmWgfd") {
    if (cards.length !== 1) throw new Error("五谷丰登只能挑选一张牌");
    const index = match.wgfdCards.findIndex((c) => cardId(c) === cards[0]);
    if (index < 0) throw new Error("五谷展示区中不存在指定卡牌");
    match.hands[actor].push(...match.wgfdCards.splice(index, 1));
    checkStatus(actor); match.wgfdQueue.shift();
    match.wgfdQueue = match.wgfdQueue.filter((id) => match.statuses[id] === "PLAYING");
    if (!match.wgfdQueue.length || !match.wgfdCards.length) {
      match.discard.push(...match.wgfdCards); match.wgfdCards = []; match.wgfdQueue = []; endResolution();
    } else match.pendingAoePlayers = [match.wgfdQueue[0]];
  } else if (action === "play" && cards.length === 1 && cards[0].startsWith("SCROLL")) {
    if (match.jdsrTarget) throw new Error("被借刀期间不能使用锦囊牌");
    if (match.usedScrolls[actor]) throw new Error("每回合只能使用一次锦囊牌");
    const card = takeFromHand(cards[0]);
    if (!TUTORIAL_SCROLLS[card.rank]) throw new Error("未知教学锦囊牌");
    if (card.rank === "JDSR" && (!match.table.length || match.last === actor)) throw new Error("借刀杀人需要其他玩家的桌面牌");
    match.discard.push(card); match.usedScrolls[actor] = true;
    if (card.rank === "JDSR") {
      const index = PLAYERS.indexOf(actor);
      const target = PLAYERS.map((_, offset) => PLAYERS[(index + offset + 1) % PLAYERS.length])
        .find((id) => id !== actor && match.statuses[id] === "PLAYING");
      if (!target) throw new Error("没有存活的其他玩家可以借刀");
      match.jdsrTarget = target; match.jdsrInitiator = actor; match.turn = target;
      if (!match.hands[actor].length) checkStatus(actor);
    } else {
      match.currentAoeType = card.rank; match.aoeInitiator = actor;
      const index = PLAYERS.indexOf(actor);
      const queue = PLAYERS.map((_, offset) => PLAYERS[(index + offset) % PLAYERS.length]).filter((id) => match.statuses[id] === "PLAYING");
      if (card.rank === "WGFD") {
        if (match.deck.length < queue.length) throw new Error("教学牌堆不足");
        match.wgfdCards = match.deck.splice(0, queue.length); match.wgfdQueue = queue;
        match.pendingAoePlayers = [queue[0]];
      } else {
        match.pendingAoePlayers = queue;
        for (const id of [...queue]) {
          if (match.hands[id].length) continue;
          draw(id, 2); checkStatus(id);
          match.pendingAoePlayers = match.pendingAoePlayers.filter((pending) => pending !== id);
        }
        if (!match.pendingAoePlayers.length) endResolution();
      }
    }
  } else if (match.jdsrTarget) {
    if (action === "pass") {
      if (cards.length) throw new Error("要不起时不能选牌");
      draw(actor, 1); checkStatus(actor);
      match.turn = match.jdsrInitiator;
    } else if (action === "play") {
      if (!cards.length || cards.some((id) => id.startsWith("SCROLL"))) throw new Error("被借刀时只能打出普通牌");
      const played = cards.map(takeFromHand);
      const proposed = tutorialPattern(played), previous = tutorialPattern(match.table);
      if (proposed.type !== previous.type || played.length !== match.table.length || proposed.weight <= previous.weight)
        throw new Error("借刀出牌不能压过桌面");
      match.discard.push(...match.table); match.table = played; match.last = match.jdsrInitiator;
      checkStatus(actor);
      // GameService keeps the borrowed player as the current actor after a successful reply.
    } else throw new Error("被借刀期间不能使用技能");
    match.jdsrTarget = null; match.jdsrInitiator = null;
  } else {
    if (cards.some((id) => id.startsWith("SCROLL"))) throw new Error("锦囊牌只能单张使用");
    const result = applyTutorialMove(match, { actor, action, cards });
    if (action === "play" || action === "pass") result.usedScrolls[result.turn] = false;
    return result;
  }
  validateTutorialDeck(match);
  return match;
}
