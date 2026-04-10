package com.game.poker.service;

import com.game.poker.model.Card;
import com.game.poker.model.GameRoom;
import com.game.poker.model.Player;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;

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

    private Card card(String suit, String rank, int weight) {
        return Card.getCard(suit, rank, weight);
    }
}
