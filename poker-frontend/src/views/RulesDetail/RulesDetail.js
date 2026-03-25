import { showRuleDetail } from "@/store/gameState.js";

const goBack = () => {
  showRuleDetail.value = false;
};

export { goBack };
