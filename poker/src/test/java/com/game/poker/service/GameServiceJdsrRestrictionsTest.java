package com.game.poker.service;

import com.game.poker.model.Card;
import com.game.poker.model.GameRoom;
import com.game.poker.model.Player;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameServiceJdsrRestrictionsTest {

    @Test
    void replaceCardIsRejectedForJdsrTarget() {
        GameService service = new GameService();
        GameRoom room = new GameRoom("room-1");
        Player bot = new Player("bot", true);
        Player other = new Player("other");

        Card discard = card("\u2660", "7", 5);
        bot.getHandCards().add(discard);

        room.setPlayers(new ArrayList<>(List.of(bot, other)));
        room.setCurrentTurnIndex(0);
        room.getSettings().put("jdsr_target", bot.getUserId());
        service.getRoomMap().put(room.getRoomId(), room);

        assertThrows(RuntimeException.class, () -> service.replaceCard(room.getRoomId(), bot.getUserId(), discard));
    }

    @Test
    void useLuanjianIsRejectedForJdsrTarget() {
        GameService service = new GameService();
        GameRoom room = new GameRoom("room-2");
        Player bot = new Player("bot", true);
        Player other = new Player("other");

        Card first = card("\u2660", "7", 5);
        Card second = card("\u2663", "9", 7);
        bot.getHandCards().add(first);
        bot.getHandCards().add(second);

        room.setPlayers(new ArrayList<>(List.of(bot, other)));
        room.setCurrentTurnIndex(0);
        room.getSettings().put("jdsr_target", bot.getUserId());
        service.getRoomMap().put(room.getRoomId(), room);

        assertThrows(RuntimeException.class,
                () -> service.useLuanjian(room.getRoomId(), bot.getUserId(), List.of(first, second)));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void successfulJdsrResponseStartsOwnTurnWithFreshActionLimits(boolean bot) {
        GameService service = new GameService();
        GameRoom room = startJdsr(service, bot);
        Player initiator = room.getPlayers().get(0);
        Player target = room.getPlayers().get(1);
        Card response = target.getHandCards().get(0);
        room.setCurrentTurnStartTime(1L);

        assertTrue(service.playCards(room.getRoomId(), target.getUserId(), new ArrayList<>(List.of(response))));

        assertAll(
                () -> assertEquals(target, room.getPlayers().get(room.getCurrentTurnIndex())),
                () -> assertEquals(initiator.getUserId(), room.getLastPlayPlayerId()),
                () -> assertEquals(List.of(response), room.getLastPlayedCards()),
                () -> assertFalse(room.getSettings().containsKey("jdsr_target")),
                () -> assertFalse(room.getSettings().containsKey("jdsr_initiator")),
                () -> assertTrue(room.getCurrentTurnStartTime() > 1L),
                () -> assertFalse(target.isHasReplacedCardThisTurn(), "本人新回合应恢复换牌次数"),
                () -> assertFalse(target.isHasUsedSkillThisTurn(), "本人新回合应恢复技能次数"),
                () -> assertFalse(target.isHasUsedAoeThisTurn(), "本人新回合应恢复锦囊次数"),
                () -> assertEquals(0, target.getKurouUsesThisTurn()),
                () -> assertEquals(5, target.getKurouUseCount(), "跨回合累计次数应保留"),
                () -> assertTrue(target.isKurouAwakened(), "永久觉醒状态应保留"),
                () -> assertTrue(initiator.isHasUsedAoeThisTurn(), "不应重置借刀发起人的锦囊次数")
        );
    }

    @Test
    void successfulJdsrResponseAllowsReplaceCardAndScrollInOwnTurn() {
        GameService service = new GameService();
        GameRoom room = startJdsr(service, false);
        Player target = room.getPlayers().get(1);

        assertTrue(service.playCards(room.getRoomId(), target.getUserId(),
                new ArrayList<>(List.of(target.getHandCards().get(0)))));

        assertTrue(service.replaceCard(room.getRoomId(), target.getUserId(), target.getHandCards().get(0)));
        assertTrue(service.playCards(room.getRoomId(), target.getUserId(),
                List.of(card("SCROLL", "JDSR", 19))));
        assertTrue(target.isHasReplacedCardThisTurn());
        assertTrue(target.isHasUsedAoeThisTurn());
        assertEquals(target.getUserId(), room.getSettings().get("jdsr_initiator"));
        assertEquals(room.getPlayers().get(0).getUserId(), room.getSettings().get("jdsr_target"));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void failedJdsrResponseResumesInitiatorsTurnWithoutResettingActionLimits(boolean timeout) {
        GameService service = new GameService();
        GameRoom room = startJdsr(service, false);
        Player initiator = room.getPlayers().get(0);
        Player target = room.getPlayers().get(1);
        List<Card> table = List.copyOf(room.getLastPlayedCards());
        int targetHandSize = target.getHandCards().size();

        if (timeout) {
            assertTrue(service.resolveExpiredAction(room.getRoomId(), room.getCurrentTurnStartTime() + 10_001));
        } else {
            service.passTurn(room.getRoomId(), target.getUserId());
        }

        assertEquals(initiator, room.getPlayers().get(room.getCurrentTurnIndex()));
        assertEquals(table, room.getLastPlayedCards());
        assertEquals(targetHandSize + 1, target.getHandCards().size());
        assertFalse(room.getSettings().containsKey("jdsr_target"));
        assertFalse(room.getSettings().containsKey("jdsr_initiator"));
        for (Player player : room.getPlayers()) {
            assertTrue(player.isHasReplacedCardThisTurn());
            assertTrue(player.isHasUsedSkillThisTurn());
            assertTrue(player.isHasUsedAoeThisTurn());
            assertEquals(2, player.getKurouUsesThisTurn());
        }
    }

    private GameRoom startJdsr(GameService service, boolean bot) {
        ReflectionTestUtils.setField(service, "ruleEngine", new RuleEngine());
        GameRoom room = new GameRoom("room-jdsr-turn");
        Player initiator = new Player("initiator");
        Player target = new Player("target", bot);
        Card jdsr = card("SCROLL", "JDSR", 19);
        initiator.getHandCards().addAll(List.of(jdsr, card("\u2663", "3", 1)));
        target.getHandCards().addAll(List.of(card("\u2660", "9", 7), card("\u2663", "10", 8), jdsr));
        room.setPlayers(new ArrayList<>(List.of(initiator, target)));
        room.setStarted(true);
        room.setPhase("PLAYING");
        room.setCurrentTurnIndex(0);
        room.setLastPlayPlayerId(target.getUserId());
        room.setLastPlayedCards(new ArrayList<>(List.of(card("\u2660", "7", 5))));
        room.getDeck().clear();
        room.getDeck().add(card("\u2660", "6", 4));
        for (Player player : room.getPlayers()) {
            player.setHasReplacedCardThisTurn(true);
            player.setHasUsedSkillThisTurn(true);
            player.setKurouUsesThisTurn(2);
        }
        target.setHasUsedAoeThisTurn(true);
        target.setKurouUseCount(5);
        target.setKurouAwakened(true);
        service.getRoomMap().put(room.getRoomId(), room);

        assertTrue(service.playCards(room.getRoomId(), initiator.getUserId(), List.of(jdsr)));
        assertEquals(target.getUserId(), room.getSettings().get("jdsr_target"));
        assertTrue(target.isHasUsedAoeThisTurn(), "进入借刀响应阶段不能提前重置本人回合次数");
        return room;
    }

    private Card card(String suit, String rank, int weight) {
        return Card.getCard(suit, rank, weight);
    }
}
