package com.game.poker.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class Player {
    private String userId;
    private List<Card> handCards;
    private String status;
    private int penaltyCount;
    private boolean bot = false;
    private boolean hasReplacedCardThisTurn = false;
    private boolean ready = false;
    private boolean disconnected = false;
    private boolean hasUsedAoeThisTurn = false;
    private String skill = "ZHIHENG";
    private boolean hasUsedSkillThisTurn = false;

    public String getSkill() {
        return skill;
    }

    public void setSkill(String skill) {
        this.skill = skill;
    }

    public boolean isHasUsedSkillThisTurn() {
        return hasUsedSkillThisTurn;
    }

    public void setHasUsedSkillThisTurn(boolean hasUsedSkillThisTurn) {
        this.hasUsedSkillThisTurn = hasUsedSkillThisTurn;
    }

    public boolean isHasUsedAoeThisTurn() {
        return hasUsedAoeThisTurn;
    }

    public void setHasUsedAoeThisTurn(boolean hasUsedAoeThisTurn) {
        this.hasUsedAoeThisTurn = hasUsedAoeThisTurn;
    }

    public boolean isDisconnected() {
        return disconnected;
    }

    public void setDisconnected(boolean disconnected) {
        this.disconnected = disconnected;
    }

    public boolean isReady() {
        return ready;
    }

    public void setReady(boolean ready) {
        this.ready = ready;
    }

    public Player(String userId) {
        this.userId = userId;
        this.handCards = new ArrayList<>();
        this.status = "PLAYING";
        this.penaltyCount = 0;
    }

    public Player(String userId, boolean bot) {
        this(userId);
        this.bot = bot;
        if (bot) {
            this.ready = true;
        }
    }

    public int getCardCount() {
        return handCards.size();
    }
}
