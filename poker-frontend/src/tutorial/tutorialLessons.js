import { createTutorialMatch, applyTutorialMove } from "./tutorialMatch.js";
import { TUTORIAL_STEPS } from "./tutorialScript.js";
import { ADVANCED_TUTORIAL_STEPS } from "./advancedTutorialScript.js";
import { createAdvancedTutorialMatch, applyAdvancedTutorialMove, canAdvancedTutorialAct } from "./advancedTutorialMatch.js";

const lessons = {
  basic: {
    kind: "basic", title: "基础教程", subtitle: "常规卡牌 · 制衡", duration: "约 3–5 分钟", steps: TUTORIAL_STEPS,
    createMatch: createTutorialMatch, applyMove: applyTutorialMove,
    canAct: (match, actor) => !match.winner && match.turn === actor && match.statuses[actor] === "PLAYING",
    isComplete: (match) => match.winner === "you",
    completionTitle: "第一场胜利，恭喜你！",
    completionText: "哇啊，真的赢了！嘿嘿～选牌、接牌、要不起，还有制衡，你都学会啦！要不要继续和小桃练练锦囊？万箭齐发、南蛮入侵、五谷丰登和借刀杀人，下一局都能体验哦～",
    review: ["接牌：同牌型、同张数、更大", "要不起：摸 2 张", "制衡：每回合弃 1 摸 1", "超过 14 张：淘汰"],
  },
  advanced: {
    kind: "advanced", title: "锦囊牌进阶教程", subtitle: "四种锦囊 · 模拟实战", duration: "约 5–7 分钟", steps: ADVANCED_TUTORIAL_STEPS,
    createMatch: createAdvancedTutorialMatch, applyMove: applyAdvancedTutorialMove, canAct: canAdvancedTutorialAct,
    isComplete: (match, index) => index === ADVANCED_TUTORIAL_STEPS.length - 1 && !match.currentAoeType && !match.jdsrTarget && !match.winner,
    completionTitle: "四种锦囊，都练过啦！",
    completionText: "好耶！和关羽、张飞一起，把四种锦囊都练过啦～记得每回合只能用一张锦囊，响应时看清要求，结算后再看轮到谁。想复习的话，小桃随时陪你再练一次！",
    review: ["万箭齐发：弃黑色牌或小王", "南蛮入侵：弃红色牌或大王", "五谷丰登：依次每人挑 1 张", "借刀杀人：下家接牌，失败摸 1 张"],
  },
};
export function getTutorialLesson(kind = "basic") {
  if (!Object.hasOwn(lessons, kind)) throw new Error("未知教学关卡");
  return lessons[kind];
}
