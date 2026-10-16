package com.game.poker.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.auth.AuthSessionKeys;
import com.game.poker.auth.SessionUser;
import com.game.poker.model.GameRoom;
import com.game.poker.service.AuthTokenService;
import com.game.poker.service.AvatarService;
import com.game.poker.service.GameRecordService;
import com.game.poker.service.GameService;
import com.game.poker.service.RuleEngine;
import com.game.poker.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RoomChatTest {
    private final GameWebSocketHandler handler = new GameWebSocketHandler();
    private final GameService service = new GameService();
    private final ObjectMapper mapper = new ObjectMapper();

    RoomChatTest() {
        ReflectionTestUtils.setField(service, "ruleEngine", new RuleEngine());
        ReflectionTestUtils.setField(handler, "gameService", service);
        ReflectionTestUtils.setField(handler, "gameRecordService", mock(GameRecordService.class));
        ReflectionTestUtils.setField(handler, "avatarService", mock(AvatarService.class));
        ReflectionTestUtils.setField(handler, "authTokenService", new AuthTokenService());
        UserService users = mock(UserService.class);
        when(users.isSessionVersionCurrent(any(SessionUser.class))).thenReturn(true);
        ReflectionTestUtils.setField(handler, "userService", users);
    }

    @AfterEach
    void close() { handler.shutdownBotExecutor(); }

    private record Peer(WebSocketSession session, List<Map<String, Object>> messages) {}

    private Peer join(String id, String room, boolean create) throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(AuthSessionKeys.LOGIN_USER, new SessionUser(1L, id, id, false, "v1"));
        when(session.getAttributes()).thenReturn(attributes);
        List<Map<String, Object>> messages = new ArrayList<>();
        doAnswer(invocation -> {
            messages.add(mapper.readValue(((TextMessage) invocation.getArgument(0)).getPayload(), Map.class));
            return null;
        }).when(session).sendMessage(any());
        send(session, room, "JOIN_ROOM", Map.of("isCreating", create));
        return new Peer(session, messages);
    }

    private void send(WebSocketSession peer, String room, String type, Object data) throws Exception {
        handler.handleTextMessage(peer, new TextMessage(mapper.writeValueAsString(Map.of("roomId", room, "type", type, "data", data))));
    }

    @Test
    void broadcastsEscapedTextAndAuthenticatedSenderOnlyToJoinedRoom() throws Exception {
        Peer owner = join("owner", "one", true), friend = join("friend", "one", false), outsider = join("outsider", "two", true);
        owner.messages.clear(); friend.messages.clear(); outsider.messages.clear();
        String content = " <b>开局</b>\"\\ ";
        send(owner.session, "one", "SEND_CHAT", content);
        assertEquals(1, friend.messages.size());
        Map<String, Object> chat = friend.messages.getFirst();
        assertEquals("CHAT_RECEIVED", chat.get("event"));
        assertEquals("owner", chat.get("userId"));
        assertEquals(content.trim(), chat.get("text"));
        assertEquals(friend.messages, owner.messages);
        assertTrue(outsider.messages.isEmpty());
    }

    @Test
    void rejectsBlankOversizeAndNonTextPayloads() throws Exception {
        Peer owner = join("owner", "one", true), friend = join("friend", "one", false);
        friend.messages.clear();
        for (Object content : List.of("  ", "\n\t", "字".repeat(25), Map.of("text", "fake"), 7)) send(owner.session, "one", "SEND_CHAT", content);
        assertTrue(friend.messages.isEmpty());
    }

    @Test
    void joinedConnectionCannotChatIntoAnotherRoom() throws Exception {
        Peer owner = join("owner", "one", true), outsider = join("outsider", "two", true);
        outsider.messages.clear();
        send(owner.session, "two", "SEND_CHAT", "不该收到");
        assertTrue(outsider.messages.isEmpty());
    }

    @Test
    void spectatorUsesTheirOwnIdentity() throws Exception {
        Peer owner = join("owner", "one", true), viewer = join("viewer", "one", false);
        GameRoom room = service.getRoom("one");
        room.getPlayers().removeIf(player -> player.getUserId().equals("viewer"));
        room.getSpectators().add("viewer");
        owner.messages.clear();
        send(viewer.session, "one", "SEND_CHAT", "稍等");
        assertEquals("viewer", owner.messages.getFirst().get("userId"));
    }
}
