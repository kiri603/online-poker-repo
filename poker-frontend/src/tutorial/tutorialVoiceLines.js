import { getTutorialLesson } from "./tutorialLessons.js";

export const TUTORIAL_INVITATION_TEXT = "呀，主公你来啦！嘿嘿～第一次玩也不用紧张，有小桃陪着你呢！要不要先一起练习一局？别紧张，我会慢慢教你的！要是现在不想玩，之后也可以从大厅找到我哦～";
export const TUTORIAL_EXIT_TEXT = "欸？这就要走啦？好吧好吧～想继续练习的话，随时都能从大厅重新开始教学，小桃会等你的哦！";
export const TUTORIAL_ERROR_TEXT = "哎呀，练习好像出了点小问题……重新开始一次吧！";

export function getTutorialVoiceLines() {
  const lines = [{ id: "invitation", text: TUTORIAL_INVITATION_TEXT }];
  for (const kind of ["basic", "advanced"]) {
    const lesson = getTutorialLesson(kind);
    lesson.steps.forEach((step, index) => step.dialogue.forEach((text, page) => {
      lines.push({ id: `${kind}-${index + 1}-${page + 1}`, text });
    }));
    lines.push({ id: `${kind}-complete`, text: lesson.completionText });
  }
  lines.push({ id: "exit", text: TUTORIAL_EXIT_TEXT }, { id: "error", text: TUTORIAL_ERROR_TEXT });
  return lines;
}
