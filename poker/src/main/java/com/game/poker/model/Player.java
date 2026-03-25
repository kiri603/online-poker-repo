package com.game.poker.model;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class Player {
    private String userId;           // 玩家ID
    private List<Card> handCards;    // 当前手牌
    private String status;           // 状态: PLAYING(游戏中), WON(获胜), LOST(淘汰)
    private int penaltyCount;        // 记录摸牌惩罚次数（可选，用于数据统计）
    private boolean hasReplacedCardThisTurn = false;
    private boolean ready = false;
    private boolean disconnected = false;
    private boolean hasUsedAoeThisTurn = false;
    private String skill = "ZHIHENG"; // 默认为制衡
    private boolean hasUsedSkillThisTurn = false;
    public String getSkill() { return skill; }
    public void setSkill(String skill) { this.skill = skill; }
    public boolean isHasUsedSkillThisTurn() { return hasUsedSkillThisTurn; }
    public void setHasUsedSkillThisTurn(boolean hasUsedSkillThisTurn) { this.hasUsedSkillThisTurn = hasUsedSkillThisTurn; }
    public boolean isHasUsedAoeThisTurn() { return hasUsedAoeThisTurn; }
    public void setHasUsedAoeThisTurn(boolean hasUsedAoeThisTurn) { this.hasUsedAoeThisTurn = hasUsedAoeThisTurn; }
    public boolean isDisconnected() { return disconnected; }
    public void setDisconnected(boolean disconnected) { this.disconnected = disconnected; }
    public boolean isReady() { return ready; }
    public void setReady(boolean ready) { this.ready = ready; }
    public Player(String userId) {
        this.userId = userId;
        this.handCards = new ArrayList<>();
        this.status = "PLAYING";
        this.penaltyCount = 0;
    }

    // 获取当前手牌数量
    public int getCardCount() {
        return handCards.size();
    }
}
