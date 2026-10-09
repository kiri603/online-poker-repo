const move = (actor, action, cards = []) => ({ actor, action, cards });
export const ADVANCED_TUTORIAL_STEPS = [
  {
    chapter: "万箭齐发", title: "锦囊出场，万箭齐发", action: "play", cards: ["SCROLLWJQF"], focus: "hand",
    instruction: "选中万箭齐发，再点击「出牌」", success: "万箭齐发发动了！我们也要准备响应哦～",
    dialogue: [
      "又见面啦！这次关羽和张飞陪我们练锦囊。还是同一张牌桌，每人开局 8 张牌，练习不限时，跟着小桃来就好～",
      "锦囊要单张使用，每回合只能用一张。它通常不会替换桌面上原来的牌，结算完还能继续出牌或要不起。可别把锦囊和普通牌一起打出去哦！",
      "先试试万箭齐发！全场存活玩家都得弃一张黑色牌或小王，否则摸两张罚牌。嘿嘿，发动者也会被波及，我们也得响应！",
    ], opponents: [],
  },
  {
    chapter: "万箭齐发", title: "弃一张黑色牌，挡住万箭", action: "discardAoe", cards: ["♠3"], focus: "hand",
    instruction: "选中黑桃 3，再点击「弃牌」", success: "挡住啦！看看关羽和张飞会怎么应对。",
    dialogue: [
      "看，牌桌正在等我们响应！选中黑桃 3，点「弃牌」就能挡住万箭。这是在响应锦囊，和普通出牌是两回事哦～",
      "关羽会弃黑色牌，张飞这次选择要不起，会摸两张。就算有符合要求的牌，也可以主动接受罚牌，不过要留意手牌数量！",
    ], opponents: [move("dragon", "discardAoe", ["♣3"]), move("tortoise", "respondAoe")],
  },
  {
    chapter: "南蛮入侵", title: "锦囊结束，继续出牌", action: "play", cards: ["♣4"], focus: "hand",
    instruction: "选中梅花 4，再点击「出牌」", success: "轮到关羽了，他准备发动南蛮入侵！",
    dialogue: [
      "万箭结算完，还是我们的回合！本回合的锦囊已经用过了，先打一张梅花 4，把回合交给关羽。",
      "接下来是南蛮入侵，要求正好相反：弃一张红色牌或大王，否则摸两张。注意，它也不会把桌面上的梅花 4 替换掉！",
    ], opponents: [move("dragon", "play", ["SCROLLNMRQ"]), move("dragon", "discardAoe", ["♥3"]), move("tortoise", "discardAoe", ["♦3"])],
  },
  {
    chapter: "南蛮入侵", title: "接受罚牌，也是一种选择", action: "respondAoe", cards: [], focus: "count",
    instruction: "点击锦囊响应区的「要不起」，观察手牌数量", success: "多了两张！南蛮结束后，关羽继续出牌。",
    dialogue: [
      "这次换我们体验罚牌！点击锦囊响应区的「要不起」，会摸两张。旁边的手牌数量会增加，超过 14 张就会被淘汰哦。",
      "关羽和张飞已经各弃了一张红色牌。虽然现在是关羽的回合，我们仍然要响应锦囊，不能等到自己的回合才处理！",
    ], opponents: [move("dragon", "play", ["♥5"]), move("tortoise", "play", ["♣6"])],
  },
  {
    chapter: "五谷丰登", title: "五谷丰登，大家来挑牌", action: "play", cards: ["SCROLLWGFD"], focus: "hand",
    instruction: "选中五谷丰登，再点击「出牌」", success: "三个人，就展示三张牌。我们先挑！",
    dialogue: [
      "轮到我们啦！五谷丰登会展示与存活人数一样多的牌，现在有三个人，就翻开三张。",
      "从发动者开始，顺时针每人挑一张加入手牌。嘿嘿，我们先选，关羽和张飞接着选。来，先把五谷丰登打出去！",
    ], opponents: [],
  },
  {
    chapter: "五谷丰登", title: "挑一张牌加入手牌", action: "confirmWgfd", cards: ["♣10"], focus: "pool",
    instruction: "选中展示区的梅花 10，再点击「确认挑选」", success: "梅花 10 到手！剩下两张由关羽、张飞依次挑选。",
    dialogue: [
      "展示牌在这里！点选梅花 10，再确认挑选，它就会加入我们的手牌。一次只能选一张哦～",
      "等关羽、张飞都选完，还是我们的回合。桌面上原来的 6 也还在，接下来得用更大的单张来接。",
    ], opponents: [move("dragon", "confirmWgfd", ["♠K"]), move("tortoise", "confirmWgfd", ["♥K"])],
  },
  {
    chapter: "借刀杀人", title: "准备借刀的时机", action: "play", cards: ["♠J"], focus: "table",
    instruction: "选中黑桃 J，压过桌面的 6", success: "关羽和张飞接牌后，就能试试借刀杀人了。",
    dialogue: [
      "这一回合已经用过五谷丰登啦，先用黑桃 J 接住桌面的 6。等对手接牌，再轮到我们，就可以用下一张锦囊！",
      "最后这张借刀杀人，需要桌面上有别人打出的牌。它会让下一位存活玩家替你接牌，不能在空桌时使用哦。",
    ], opponents: [move("dragon", "play", ["♥Q"]), move("tortoise", "play", ["♣K"])],
  },
  {
    chapter: "借刀杀人", title: "借刀杀人，让下家应对", action: "play", cards: ["SCROLLJDSR"], focus: "table",
    instruction: "选中借刀杀人，再点击「出牌」", success: "关羽要不起，只摸一张，回合回到我们手里！",
    dialogue: [
      "现在桌上是张飞的 K，符合借刀条件！打出借刀杀人，就会让下家关羽替我们接这张牌。",
      "如果他能接住，接出的牌会算在我们名下，我们的回合结束。如果他要不起，只罚摸一张，然后我们继续行动。关羽这次会演示要不起！",
      "被借刀时只能应对桌面的牌，不能用锦囊或技能。正式对局限时 10 秒，这里仍然不限时。来，看看借刀的效果吧～",
    ], opponents: [move("dragon", "pass")],
  },
  {
    chapter: "借刀杀人", title: "回合回来了，继续接牌", action: "play", cards: ["♥A"], focus: "table",
    instruction: "选中红桃 A，压过桌面的 K", success: "接住啦！四种锦囊都练过了，来和小桃复习一下～",
    dialogue: [
      "看到啦？关羽只多了一张牌，桌面还是张飞的 K，回合回到我们这里了。最后用红桃 A 接住它吧！",
      "嘿嘿，四种锦囊的关键操作都练过啦。去真正的牌桌时，记得看看响应条件、手牌数量，还有锦囊结算后轮到谁！",
    ], opponents: [],
  },
];
