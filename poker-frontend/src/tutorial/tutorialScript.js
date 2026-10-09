const move = (actor, action, cards = []) => ({ actor, action, cards });
export const TUTORIAL_NAMES = { you: "你", dragon: "关羽", tortoise: "张飞" };
export const TUTORIAL_STEPS = [
  {
    title: "打出第一张牌", action: "play", cards: ["♠3"], focus: "hand",
    instruction: "选择黑桃 3，再点击「出牌」", success: "漂亮！第一张牌成功打出去啦～接下来看看轮到谁。",
    dialogue: [
      "好耶！那就开始啦～这局是练习，你和另外两位对手各有 8 张牌。谁先把手牌全部出光，谁就赢啦！",
      "对了，正式对局可是有倒计时的哦！不过现在不用着急，这局不限时，跟着小桃慢慢来就好～",
      "来，看到那张黑桃 3 了吗？点一下选中它，再点击「出牌」。嘿嘿，先把我们的第一张牌打出去吧！",
    ],
    opponents: [move("dragon", "play", ["♥5"]), move("tortoise", "play", ["♠6"])],
  },
  {
    title: "用更大的牌接住", action: "play", cards: ["♣9"], focus: "table",
    instruction: "选择梅花 9，压过桌上的 6", success: "嘿嘿，9 比 6 大！成功压住啦，不错嘛～",
    dialogue: [
      "欸，对手出了一张 6！想压过它，就得用更大的单张才行。我们手里的这张 9 就刚刚好！",
      "记一下大小顺序哦：从 3 到 A 越来越大，然后是 2、小王和大王。还有还有，普通接牌必须牌型相同、张数也相同，可不能随便乱出哦～",
    ], showRanks: true,
    opponents: [move("dragon", "play", ["♣2"]), move("tortoise", "pass")],
  },
  {
    title: "要不起也有代价", action: "pass", cards: [], focus: "table",
    instruction: "点击「要不起」，观察手牌数量", success: "呜呜，又多了两张牌！这就是「要不起」的代价啦，下次可得算好哦～",
    dialogue: [
      "呜哇，对面居然出了张 2！我们现在没有更大的单张了，只能「要不起」啦。不过要小心哦，要不起会摸两张牌，就算手里有牌能接，主动放弃也一样会受罚的！",
      "而且呀，手牌一旦超过 14 张，就会被淘汰！不过刚好 14 张还是安全的。来，先试着点一次「要不起」，注意看看右边的手牌数量～",
    ], opponents: [move("dragon", "play", ["♣3", "♦3"]), move("tortoise", "pass")],
  },
  {
    title: "两张一起，组成对子", action: "play", cards: ["♠4", "♥4"], focus: "table",
    instruction: "选择两张 4，再点击「出牌」", success: "好耶！对子 4 成功压过对子 3！哼哼，越来越熟练了嘛～",
    dialogue: [
      "锵锵～接下来是对子！两张点数一样的牌就能组成对子。不过呢，对子只能用更大的对子来接，就算单张 9 再大，也不能拿来接对子哦！",
      "来来，找到那两张 4 了吗？把它们一起选中，再出牌！等其他人都要不起，桌面就会清空，到时候就又能自由出牌啦～",
    ], opponents: [move("dragon", "pass"), move("tortoise", "pass")],
  },
  {
    title: "制衡，让手牌更顺", action: "replace", cards: ["♥3"], focus: "hand",
    instruction: "选择红桃 3，再点击「制衡」", success: "哇！居然真的换到 10 了！嘿嘿，这下有好戏看啦～",
    dialogue: [
      "嘿嘿，接下来教你一个小技巧——「制衡」！可以丢掉一张牌，再摸一张新的，手牌数量不会变哦。不过每回合只能用一次，换完牌之后还可以继续出牌！",
      "你看，我们手里已经有 5、6、7、8、9 了！要是再来张 10……嘿嘿，那可就有意思啦！试试选中这张红桃 3，点击「制衡」，看看能不能换张好牌回来～",
    ], opponents: [],
  },
  {
    title: "连成顺子，拿下胜利", action: "play", cards: ["♣5", "♦6", "♠7", "♥8", "♥9", "♥10"], focus: "hand",
    instruction: "选中全部六张牌，再点击「出牌」", success: "赢啦——！！手牌全部出光！好耶好耶，第一场胜利到手啦！",
    dialogue: [
      "看出来了吗？连续五张以上的牌，就能组成顺子啦！不过 2 和大小王不能放进顺子里哦。要接别人的顺子，还得张数一样，再比谁最大的那张牌更大！",
      "哼哼～现在我们从 5 一直连到了 10，刚好六张！快，把它们全部选上，一口气打出去！只要出光手牌，我们就赢啦！",
    ], opponents: [],
  },
];
