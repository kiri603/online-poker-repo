package com.game.poker.service;

import com.game.poker.model.Card;
import com.game.poker.model.GameRoom;
import com.game.poker.model.Player;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class ScriptedAiServiceTest {

    @Test
    void jdsrTargetPassesInsteadOfUsingSkillOrReplaceWhenNoValidResponseExists() throws Exception {
        ScriptedAiService service = createServiceWithRuleEngine();
        GameRoom room = new GameRoom("room-1");

        Player initiator = new Player("p1");
        Player bot = new Player("bot", true);
        bot.setSkill("ZHIHENG");
        bot.getHandCards().add(card("\u2665", "4", 2));
        bot.getHandCards().add(card("\u2663", "5", 3));

        room.setPlayers(new ArrayList<>(List.of(initiator, bot)));
        room.setCurrentTurnIndex(1);
        room.setLastPlayPlayerId(initiator.getUserId());
        room.setLastPlayedCards(new ArrayList<>(List.of(card("\u2660", "10", 8))));
        room.getSettings().put("jdsr_initiator", initiator.getUserId());
        room.getSettings().put("jdsr_target", bot.getUserId());

        ScriptedAiService.TurnDecision decision = service.decideTurn(room, bot);

        assertEquals(ScriptedAiService.TurnDecisionType.PASS, decision.getType());
    }

    @Test
    void jdsrTargetStillPlaysWhenItHasAValidResponse() throws Exception {
        ScriptedAiService service = createServiceWithRuleEngine();
        GameRoom room = new GameRoom("room-2");

        Player initiator = new Player("p1");
        Player bot = new Player("bot", true);
        bot.setSkill("GUSHOU");
        bot.getHandCards().add(card("\u2660", "J", 9));
        bot.getHandCards().add(card("\u2665", "4", 2));

        room.setPlayers(new ArrayList<>(List.of(initiator, bot)));
        room.setCurrentTurnIndex(1);
        room.setLastPlayPlayerId(initiator.getUserId());
        room.setLastPlayedCards(new ArrayList<>(List.of(card("\u2663", "10", 8))));
        room.getSettings().put("jdsr_initiator", initiator.getUserId());
        room.getSettings().put("jdsr_target", bot.getUserId());

        ScriptedAiService.TurnDecision decision = service.decideTurn(room, bot);

        assertEquals(ScriptedAiService.TurnDecisionType.PLAY, decision.getType());
        assertEquals(List.of(card("\u2660", "J", 9)), decision.getCards());
    }

    @Test
    void botDoesNotAttemptSecondScrollAfterAlreadyUsingOneThisTurn() throws Exception {
        ScriptedAiService service = createServiceWithRuleEngine();
        GameRoom room = new GameRoom("room-3");

        Player bot = new Player("bot", true);
        Player other = new Player("other");
        bot.setHasUsedAoeThisTurn(true);
        bot.getHandCards().add(card("SCROLL", "NMRQ", 17));
        bot.getHandCards().add(card("\u2660", "7", 5));

        room.setPlayers(new ArrayList<>(List.of(bot, other)));
        room.setCurrentTurnIndex(0);
        room.setLastPlayedCards(new ArrayList<>());
        room.setLastPlayPlayerId("");

        ScriptedAiService.TurnDecision decision = service.decideTurn(room, bot);

        assertNotEquals(ScriptedAiService.TurnDecisionType.USE_SKILL, decision.getType());
        if (decision.getType() == ScriptedAiService.TurnDecisionType.PLAY) {
            assertNotEquals("SCROLL", decision.getCards().get(0).getSuit());
        }
    }

    @Test
    void kurouBotWithNearBustHandRefusesToUseKurou() throws Exception {
        // 手牌 11 张，未觉醒 —— 用后将变 13 张，紧贴爆牌 14 的红线。
        // 新策略要求 未觉醒 handAfter ≤ 10，故应拒绝使用苦肉。
        ScriptedAiService service = createServiceWithRuleEngine();
        GameRoom room = new GameRoom("room-kurou-bust");
        Player bot = new Player("bot", true);
        bot.setSkill("KUROU");
        Player other = new Player("other");
        other.getHandCards().add(card("\u2660", "5", 3));
        other.getHandCards().add(card("\u2665", "5", 3));

        String[] ranks = {"3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"};
        for (int i = 0; i < ranks.length; i++) {
            bot.getHandCards().add(card("\u2660", ranks[i], i + 1));
        }

        room.setPlayers(new ArrayList<>(List.of(bot, other)));
        room.setCurrentTurnIndex(0);
        room.setLastPlayedCards(new ArrayList<>());
        room.setLastPlayPlayerId("");

        ScriptedAiService.TurnDecision decision = service.decideTurn(room, bot);

        assertNotEquals(ScriptedAiService.TurnDecisionType.USE_KUROU, decision.getType());
    }

    @Test
    void awakenedKurouBotSkipsKurouWhenHandIsTidy() throws Exception {
        // 已觉醒 + 牌型整齐（两对 + 一对三连对基础），
        // 苦肉再用没有额外价值，应跳过；改打普通牌路径。
        ScriptedAiService service = createServiceWithRuleEngine();
        GameRoom room = new GameRoom("room-kurou-awaken-tidy");
        Player bot = new Player("bot", true);
        bot.setSkill("KUROU");
        bot.setKurouAwakened(true);
        bot.setKurouUseCount(3);
        Player other = new Player("other");
        other.getHandCards().add(card("\u2660", "5", 3));
        other.getHandCards().add(card("\u2665", "5", 3));

        // 一对 4 + 一对 6 + 一张 8 —— 散牌只有 1，新策略不应再刷
        bot.getHandCards().add(card("\u2660", "4", 2));
        bot.getHandCards().add(card("\u2665", "4", 2));
        bot.getHandCards().add(card("\u2660", "6", 4));
        bot.getHandCards().add(card("\u2665", "6", 4));
        bot.getHandCards().add(card("\u2660", "8", 6));

        room.setPlayers(new ArrayList<>(List.of(bot, other)));
        room.setCurrentTurnIndex(0);
        room.setLastPlayedCards(new ArrayList<>());
        room.setLastPlayPlayerId("");

        ScriptedAiService.TurnDecision decision = service.decideTurn(room, bot);

        assertNotEquals(ScriptedAiService.TurnDecisionType.USE_KUROU, decision.getType());
    }

    @Test
    void kurouBotSkipsKurouWhenOpponentNearWinning() throws Exception {
        // 威胁场景：对手只剩 2 张，应该放弃刷牌集中资源应对
        ScriptedAiService service = createServiceWithRuleEngine();
        GameRoom room = new GameRoom("room-kurou-threat");
        Player bot = new Player("bot", true);
        bot.setSkill("KUROU");
        Player threat = new Player("threat");
        threat.setStatus("PLAYING");
        threat.getHandCards().add(card("\u2660", "5", 3));
        threat.getHandCards().add(card("\u2665", "5", 3));

        // 全散牌，本来是苦肉"控牌"的理想场景
        String[] ranks = {"3", "4", "5", "6", "7"};
        for (int i = 0; i < ranks.length; i++) {
            bot.getHandCards().add(card("\u2663", ranks[i], i + 1));
        }
        bot.setStatus("PLAYING");

        room.setPlayers(new ArrayList<>(List.of(bot, threat)));
        room.setCurrentTurnIndex(0);
        room.setLastPlayedCards(new ArrayList<>());
        room.setLastPlayPlayerId("");

        ScriptedAiService.TurnDecision decision = service.decideTurn(room, bot);

        assertNotEquals(ScriptedAiService.TurnDecisionType.USE_KUROU, decision.getType());
    }

    @Test
    void kurouBotUsesKurouForControlOnMessyHand() throws Exception {
        // 未觉醒 + 手牌碎（5 张全散） + 对手手牌正常 —— 应该主动刷一次控牌
        ScriptedAiService service = createServiceWithRuleEngine();
        GameRoom room = new GameRoom("room-kurou-messy");
        Player bot = new Player("bot", true);
        bot.setSkill("KUROU");
        bot.setStatus("PLAYING");
        Player other = new Player("other");
        other.setStatus("PLAYING");
        // 故意让对手保持 5 张以上，避免触发 threat
        String[] otherRanks = {"3", "4", "5", "6", "7"};
        for (int i = 0; i < otherRanks.length; i++) {
            other.getHandCards().add(card("\u2666", otherRanks[i], i + 1));
        }

        // 5 张全散（3/5/7/9/J），不同权重无对子、无连续
        bot.getHandCards().add(card("\u2663", "3", 1));
        bot.getHandCards().add(card("\u2663", "5", 3));
        bot.getHandCards().add(card("\u2663", "7", 5));
        bot.getHandCards().add(card("\u2663", "9", 7));
        bot.getHandCards().add(card("\u2663", "J", 9));

        room.setPlayers(new ArrayList<>(List.of(bot, other)));
        room.setCurrentTurnIndex(0);
        room.setLastPlayedCards(new ArrayList<>());
        room.setLastPlayPlayerId("");

        ScriptedAiService.TurnDecision decision = service.decideTurn(room, bot);

        assertEquals(ScriptedAiService.TurnDecisionType.USE_KUROU, decision.getType());
        assertEquals(2, decision.getCards().size());
    }

    @Test
    void emergencyFreeTurnPlayIgnoresScrollCards() throws Exception {
        ScriptedAiService service = createServiceWithRuleEngine();
        Player bot = new Player("bot", true);
        bot.getHandCards().add(card("SCROLL", "WGFD", 18));
        bot.getHandCards().add(card("\u2663", "9", 7));
        bot.getHandCards().add(card("\u2665", "9", 7));

        List<Card> emergencyPlay = service.chooseEmergencyFreeTurnPlay(bot);

        assertEquals(List.of(card("\u2663", "9", 7), card("\u2665", "9", 7)), emergencyPlay);
    }

    private ScriptedAiService createServiceWithRuleEngine() throws Exception {
        ScriptedAiService service = new ScriptedAiService();
        Field field = ScriptedAiService.class.getDeclaredField("ruleEngine");
        field.setAccessible(true);
        field.set(service, new RuleEngine());
        return service;
    }

    private Card card(String suit, String rank, int weight) {
        return Card.getCard(suit, rank, weight);
    }
}
