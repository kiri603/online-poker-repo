package com.game.poker.service;

import com.game.poker.model.Card;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 覆盖出牌规则引擎中的牌型比较：
 * - 王炸（ROCKET）为最大牌型，任何炸弹都压不住
 * - 炸弹 vs 炸弹 比权重
 * - 炸弹 > 普通牌型
 */
class RuleEngineTest {

    private static final String SPADE = "\u2660";
    private static final String HEART = "\u2665";
    private static final String CLUB = "\u2663";
    private static final String DIAMOND = "\u2666";

    private final RuleEngine ruleEngine = new RuleEngine();

    @Test
    void rocketBeatsAnyBomb() {
        List<Card> rocket = List.of(
                Card.getCard("JOKER", "\u5c0f\u738b", 14),
                Card.getCard("JOKER", "\u5927\u738b", 15)
        );

        // 王炸打出在空桌 / 任意牌面上永远合法
        assertTrue(ruleEngine.isValidPlay(rocket, List.of()));

        // 哪怕对方是 2 炸（权重 13，当前最大普通炸弹），王炸仍应成功压制
        List<Card> twoBomb = bomb("2", 13);
        assertTrue(ruleEngine.isValidPlay(rocket, twoBomb));
    }

    @Test
    void bombCannotBeatRocket() {
        List<Card> rocket = List.of(
                Card.getCard("JOKER", "\u5c0f\u738b", 14),
                Card.getCard("JOKER", "\u5927\u738b", 15)
        );

        // 回归：用户报告的 "8 炸 > 王炸" bug —— 8 炸权重 6
        assertFalse(ruleEngine.isValidPlay(bomb("8", 6), rocket));
        // 用最大的普通炸弹（2 炸，权重 13）也不应压住王炸
        assertFalse(ruleEngine.isValidPlay(bomb("2", 13), rocket));
        // 各种中间权重也不行
        assertFalse(ruleEngine.isValidPlay(bomb("K", 11), rocket));
    }

    @Test
    void higherBombBeatsLowerBomb() {
        assertTrue(ruleEngine.isValidPlay(bomb("K", 11), bomb("8", 6)));
        assertFalse(ruleEngine.isValidPlay(bomb("8", 6), bomb("K", 11)));
    }

    @Test
    void bombBeatsNormalPatterns() {
        // 炸弹压一手对子
        List<Card> pair = List.of(
                Card.getCard(SPADE, "10", 8),
                Card.getCard(HEART, "10", 8)
        );
        assertTrue(ruleEngine.isValidPlay(bomb("5", 3), pair));

        // 炸弹压一张单牌
        List<Card> single = List.of(Card.getCard(DIAMOND, "A", 12));
        assertTrue(ruleEngine.isValidPlay(bomb("3", 1), single));
    }

    private List<Card> bomb(String rank, int weight) {
        return List.of(
                Card.getCard(SPADE, rank, weight),
                Card.getCard(HEART, rank, weight),
                Card.getCard(CLUB, rank, weight),
                Card.getCard(DIAMOND, rank, weight)
        );
    }
}
