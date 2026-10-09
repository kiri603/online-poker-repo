package com.game.poker.websocket;

import com.game.poker.auth.AuthSessionKeys;
import com.game.poker.auth.AuthHandshakeInterceptor;
import com.game.poker.auth.SessionUser;
import com.game.poker.model.GameRoom;
import com.game.poker.model.Card;
import com.game.poker.service.GameRecordService;
import com.game.poker.service.AuthService;
import com.game.poker.service.AuthTokenService;
import com.game.poker.service.GameService;
import com.game.poker.service.RuleEngine;
import com.game.poker.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class GameWebSocketReliabilityTest {
    private final GameService service = new GameService();
    private final GameWebSocketHandler handler = new GameWebSocketHandler();
    private final AuthTokenService tokens = new AuthTokenService();

    GameWebSocketReliabilityTest() {
        ReflectionTestUtils.setField(service, "ruleEngine", new RuleEngine());
        ReflectionTestUtils.setField(handler, "gameService", service);
        ReflectionTestUtils.setField(handler, "gameRecordService", mock(GameRecordService.class));
        UserService users = mock(UserService.class);
        when(users.isSessionVersionCurrent(any(SessionUser.class))).thenReturn(true);
        ReflectionTestUtils.setField(handler, "userService", users);
        ReflectionTestUtils.setField(handler, "avatarService", mock(com.game.poker.service.AvatarService.class));
        ReflectionTestUtils.setField(handler, "authTokenService", tokens);
    }

    @AfterEach
    void stopExecutors() {
        handler.shutdownBotExecutor();
    }

    @Test
    void failedPeerDoesNotPreventDeliveryToHealthyPeer() throws Exception {
        WebSocketSession failed = session("failed", "p1");
        WebSocketSession healthy = session("healthy", "p2");
        doThrow(new IOException("simulated broken transport")).when(failed).sendMessage(any());
        sessions().put("room", new CopyOnWriteArraySet<>(List.of(failed, healthy)));

        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(handler, "broadcastToRoom", "room", new TextMessage("{}")));

        verify(healthy).sendMessage(any());
    }

    @Test
    void concurrentBroadcastsNeverWriteTheSameTransportAtOnce() throws Exception {
        WebSocketSession peer = session("one", "p1");
        sessions().put("room", new CopyOnWriteArraySet<>(List.of(peer)));
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger active = new AtomicInteger();
        AtomicInteger peak = new AtomicInteger();
        AtomicInteger delivered = new AtomicInteger();
        doAnswer(invocation -> {
            peak.accumulateAndGet(active.incrementAndGet(), Math::max);
            entered.countDown();
            release.await(2, TimeUnit.SECONDS);
            delivered.incrementAndGet();
            active.decrementAndGet();
            return null;
        }).when(peer).sendMessage(any());

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> broadcast("room"));
            assertTrue(entered.await(1, TimeUnit.SECONDS));
            var second = executor.submit(() -> broadcast("room"));
            try {
                second.get(200, TimeUnit.MILLISECONDS);
            } catch (java.util.concurrent.TimeoutException expectedForUnprotectedSender) {
                // An unprotected second send is blocked in the transport alongside the first.
            } finally {
                release.countDown();
            }
            first.get(3, TimeUnit.SECONDS);
            second.get(3, TimeUnit.SECONDS);
        }

        assertEquals(2, delivered.get());
        assertEquals(1, peak.get());
    }

    @Test
    void abnormalDisconnectKeepsTheSeatAndHandUntilRecovery() throws Exception {
        WebSocketSession first = session("first", "p1");
        GameRoom room = startTwoPlayerGame(first);
        var player = room.getPlayers().get(0);
        var hand = List.copyOf(player.getHandCards());

        handler.afterConnectionClosed(first, CloseStatus.NO_CLOSE_FRAME);

        assertEquals("PLAYING", player.getStatus());
        assertEquals(hand, player.getHandCards());
        assertTrue(player.isDisconnected());
        assertTrue(room.isStarted());

        WebSocketSession recovered = session("recovered", "p1");
        join(recovered, false);
        assertFalse(player.isDisconnected());
        assertEquals(hand, player.getHandCards());
        assertTrue(sessions().get("room").contains(recovered));
    }

    @Test
    void closingReplacedSessionCannotEliminateTheRecoveredPlayer() throws Exception {
        WebSocketSession old = session("old", "p1");
        GameRoom room = startTwoPlayerGame(old);
        WebSocketSession replacement = session("replacement", "p1");
        join(replacement, false);

        handler.afterConnectionClosed(old, CloseStatus.NORMAL);

        assertEquals("PLAYING", room.getPlayers().get(0).getStatus());
        assertFalse(room.getPlayers().get(0).isDisconnected());
        assertTrue(room.isStarted());
    }

    @Test
    void queuedOldConnectionActionCannotRunAfterAReplacementTakesTheSeat() throws Exception {
        WebSocketSession old = session("queued-old", "p1");
        GameRoom room = startTwoPlayerGame(old);
        var hand = List.copyOf(room.getPlayers().get(0).getHandCards());
        String cardJson = new ObjectMapper().writeValueAsString(List.of(hand.get(0)));
        TextMessage action = new TextMessage("{\"type\":\"PLAY_CARD\",\"roomId\":\"room\",\"data\":" + cardJson + "}");
        Object lock = ReflectionTestUtils.invokeMethod(handler, "actionLock", "room");
        AtomicReference<Thread> actionThread = new AtomicReference<>();
        try (var executor = Executors.newSingleThreadExecutor()) {
            java.util.concurrent.Future<?> queued;
            synchronized (lock) {
                queued = executor.submit(() -> {
                    actionThread.set(Thread.currentThread());
                    try { handler.handleTextMessage(old, action); }
                    catch (Exception e) { throw new RuntimeException(e); }
                });
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
                while ((actionThread.get() == null || actionThread.get().getState() != Thread.State.BLOCKED)
                        && System.nanoTime() < deadline) Thread.onSpinWait();
                assertNotNull(actionThread.get());
                assertEquals(Thread.State.BLOCKED, actionThread.get().getState());
                join(session("queued-replacement", "p1"), false);
            }
            queued.get(2, TimeUnit.SECONDS);
        }
        assertEquals(hand, room.getPlayers().get(0).getHandCards());
        assertEquals(0, room.getCurrentTurnIndex());
        assertTrue(room.getLastPlayedCards().isEmpty());
    }

    @Test
    void expiredReconnectWindowAppliesTheNormalDepartureRule() throws Exception {
        WebSocketSession peer = session("expired", "p1");
        GameRoom room = startTwoPlayerGame(peer);
        handler.afterConnectionClosed(peer, CloseStatus.NO_CLOSE_FRAME);

        ReflectionTestUtils.invokeMethod(handler, "runMaintenance", System.currentTimeMillis() + 31_000);

        assertEquals("LOST", room.getPlayers().get(0).getStatus());
        assertEquals("WON", room.getPlayers().get(1).getStatus());
        assertFalse(room.isStarted());
    }

    @Test
    void serverAdvancesExpiredTurnWithoutAClientAction() throws Exception {
        GameRoom room = startTwoPlayerGame(session("idle", "p1"));
        var player = room.getPlayers().get(0);
        int count = player.getHandCards().size();
        long now = System.currentTimeMillis();
        room.setCurrentTurnStartTime(now - 21_000);

        ReflectionTestUtils.invokeMethod(handler, "runMaintenance", now);

        assertEquals(count - 1, player.getHandCards().size());
        assertEquals("p1", room.getLastPlayPlayerId());
        assertEquals(1, room.getCurrentTurnIndex());
        ReflectionTestUtils.invokeMethod(handler, "runMaintenance", now);
        assertEquals(1, room.getCurrentTurnIndex());
    }

    @Test
    void timeoutCanLeadAgainWhenTheTurnReturnsToTheLastPlayer() throws Exception {
        GameRoom room = startTwoPlayerGame(session("lead-again", "p1"));
        room.setLastPlayPlayerId("p1");
        room.setLastPlayedCards(new ArrayList<>(List.of(Card.getCard("♠", "2", 13))));
        room.setCurrentTurnStartTime(System.currentTimeMillis() - 21_000);
        int count = room.getPlayers().get(0).getHandCards().size();
        assertDoesNotThrow(() -> service.resolveExpiredAction("room", System.currentTimeMillis()));
        assertEquals(count - 1, room.getPlayers().get(0).getHandCards().size());
    }

    @Test
    void explicitLeaveDoesNotWaitForTheRecoveryWindow() throws Exception {
        WebSocketSession peer = session("leaving", "p1");
        GameRoom room = startTwoPlayerGame(peer);
        handler.handleTextMessage(peer, new TextMessage("{\"type\":\"LEAVE_ROOM\",\"roomId\":\"room\"}"));
        handler.afterConnectionClosed(peer, CloseStatus.NORMAL);
        assertEquals("LOST", room.getPlayers().get(0).getStatus());
        assertEquals("WON", room.getPlayers().get(1).getStatus());
    }

    @Test
    void lateActionFromTheExpiredTurnCannotAdvanceTheNewTurn() throws Exception {
        WebSocketSession peer = session("late", "p1");
        GameRoom room = startTwoPlayerGame(peer);
        long oldStart = System.currentTimeMillis() - 21_000;
        room.setCurrentTurnStartTime(oldStart);
        ReflectionTestUtils.invokeMethod(handler, "runMaintenance", System.currentTimeMillis());
        var hand = List.copyOf(room.getPlayers().get(0).getHandCards());
        var table = List.copyOf(room.getLastPlayedCards());
        handler.handleTextMessage(peer, new TextMessage("{\"type\":\"PASS\",\"roomId\":\"room\",\"actionStartTime\":" + oldStart + "}"));
        assertEquals(hand, room.getPlayers().get(0).getHandCards());
        assertEquals(table, room.getLastPlayedCards());
        assertEquals(1, room.getCurrentTurnIndex());
    }

    @Test
    void recoveryResendsPrivateGuanxingCardsOnlyToTheirOwner() throws Exception {
        WebSocketSession peer = session("private", "p1");
        GameRoom room = startTwoPlayerGame(peer);
        room.setCurrentAoeType("GUANXING");
        room.getPendingAoePlayers().add("p1");
        room.getSettings().put("guanxingCards", List.of(Card.getCard("♠", "3", 1)));
        WebSocketSession other = sessions().get("room").stream().filter(s -> "second".equals(s.getId())).findFirst().orElseThrow();
        clearInvocations(other);
        handler.afterConnectionClosed(peer, CloseStatus.NO_CLOSE_FRAME);
        WebSocketSession recovered = session("private-recovered", "p1");
        join(recovered, false);
        verify(recovered).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("GUANXING_SHOW")));
        verify(other, never()).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("GUANXING_SHOW")));
    }

    @Test
    void selectionDeadlineDealsExactlyOnceWithoutClientTimers() throws Exception {
        join(session("selecting", "p1"), true);
        join(session("selecting-other", "p2"), false);
        GameRoom room = service.getRoom("room");
        room.getSettings().put("enableSkills", true);
        room.getPlayers().get(1).setReady(true);
        service.startGame("room", "p1");
        room.setCurrentTurnStartTime(System.currentTimeMillis() - 21_000);
        long now = System.currentTimeMillis();
        ReflectionTestUtils.invokeMethod(handler, "runMaintenance", now);
        assertEquals("PLAYING", room.getPhase());
        var hand = List.copyOf(room.getPlayers().get(0).getHandCards());
        assertEquals(8, hand.size());
        assertEquals("ZHIHENG", room.getPlayers().get(0).getSkill());
        ReflectionTestUtils.invokeMethod(handler, "runMaintenance", now);
        assertEquals(hand, room.getPlayers().get(0).getHandCards());
    }

    @Test
    void aoeTimeoutAndLateClientResponseSettleOnlyOnce() throws Exception {
        WebSocketSession peer = session("aoe", "p1");
        GameRoom room = startTwoPlayerGame(peer);
        room.setCurrentAoeType("NMRQ");
        room.setAoeInitiator("p2");
        room.getPendingAoePlayers().add("p1");
        long oldStart = System.currentTimeMillis() - 11_000;
        room.setAoeStartTime(oldStart);
        int count = room.getPlayers().get(0).getHandCards().size();
        ReflectionTestUtils.invokeMethod(handler, "runMaintenance", System.currentTimeMillis());
        assertNull(room.getCurrentAoeType());
        assertEquals(count + 2, room.getPlayers().get(0).getHandCards().size());
        handler.handleTextMessage(peer, new TextMessage("{\"type\":\"RESPOND_AOE\",\"roomId\":\"room\",\"actionStartTime\":" + oldStart + "}"));
        assertEquals(count + 2, room.getPlayers().get(0).getHandCards().size());
    }

    @Test
    void depletedWgfdAndGuanxingPoolsCannotStrandTheRoom() throws Exception {
        GameRoom room = startTwoPlayerGame(session("empty", "p1"));
        for (String type : List.of("WGFD", "GUANXING")) {
            room.setCurrentAoeType(type);
            room.getPendingAoePlayers().add("p1");
            room.setAoeStartTime(System.currentTimeMillis() - 11_000);
            room.getSettings().put("wgfdCards", new ArrayList<Card>());
            room.getSettings().put("wgfdQueue", new ArrayList<>(List.of("p1")));
            room.getSettings().put("guanxingCards", List.of());
            assertTrue(service.resolveExpiredAction("room", System.currentTimeMillis()));
            assertNull(room.getCurrentAoeType());
            assertTrue(room.getPendingAoePlayers().isEmpty());
        }
    }

    @Test
    void snapshotNoticesAreSentOutsideTheRoomStateLock() throws Exception {
        WebSocketSession peer = session("notices", "p1");
        GameRoom room = startTwoPlayerGame(peer);
        room.getSettings().put("justShuffled", true);
        room.getSettings().put("cardWarningUserId", "p1");
        room.getSettings().put("cardWarningCount", 2);
        doAnswer(invocation -> {
            assertFalse(Thread.holdsLock(room), "transport send must not hold the room state lock");
            return null;
        }).when(peer).sendMessage(any());
        ReflectionTestUtils.invokeMethod(handler, "broadcastGameState", "room");
    }

    @Test
    void jdsrDeadlineUsesTenSecondsAndItsExistingPenalty() throws Exception {
        GameRoom room = startTwoPlayerGame(session("jdsr", "p1"));
        room.getSettings().put("jdsr_target", "p1");
        room.getSettings().put("jdsr_initiator", "p2");
        long now = System.currentTimeMillis();
        room.setCurrentTurnStartTime(now - 9_000);
        assertFalse(service.resolveExpiredAction("room", now));
        int count = room.getPlayers().get(0).getHandCards().size();
        assertTrue(service.resolveExpiredAction("room", now + 2_000));
        assertEquals(count + 1, room.getPlayers().get(0).getHandCards().size());
        assertFalse(room.getSettings().containsKey("jdsr_target"));
    }

    @Test
    void serverCompletesGushouAndKurouAwakeningTimeouts() throws Exception {
        GameRoom room = startTwoPlayerGame(session("skills", "p1"));
        var player = room.getPlayers().get(0);
        int count = player.getHandCards().size();
        room.setCurrentAoeType("GUSHOU_DISCARD");
        room.getPendingAoePlayers().add("p1");
        room.setAoeStartTime(System.currentTimeMillis() - 11_000);
        assertTrue(service.resolveExpiredAction("room", System.currentTimeMillis()));
        assertEquals(count - 2, player.getHandCards().size());
        assertNull(room.getCurrentAoeType());
        room.setCurrentTurnIndex(0);
        room.setCurrentAoeType("KUROU_AWAKEN_DISCARD");
        room.getPendingAoePlayers().add("p1");
        player.setKurouPendingAwakenDiscard(true);
        room.setAoeStartTime(System.currentTimeMillis() - 11_000);
        assertTrue(service.resolveExpiredAction("room", System.currentTimeMillis()));
        assertFalse(player.isKurouPendingAwakenDiscard());
        assertNull(room.getCurrentAoeType());
        assertEquals(count - 2, player.getHandCards().size());
        assertEquals(1, room.getCurrentTurnIndex());
    }

    @Test
    void guixinDeadlineRejectsTheDecisionAndContinuesThePass() throws Exception {
        GameRoom room = startTwoPlayerGame(session("guixin", "p1"));
        var owner = room.getPlayers().get(1);
        owner.setSkill("GUIXIN");
        owner.setGuixinDisabled(true);
        room.setLastPlayPlayerId("p2");
        room.setLastPlayedCards(new ArrayList<>(List.of(Card.getCard("♠", "3", 1))));
        int count = room.getPlayers().get(0).getHandCards().size();
        service.passTurn("room", "p1");
        assertEquals(GameService.GUIXIN_DECISION, room.getCurrentAoeType());
        room.setAoeStartTime(System.currentTimeMillis() - 11_000);
        assertTrue(service.resolveExpiredAction("room", System.currentTimeMillis()));
        assertNull(room.getCurrentAoeType());
        assertTrue(owner.isGuixinDisabled());
        assertEquals(count + 2, room.getPlayers().get(0).getHandCards().size());
        assertEquals(1, room.getCurrentTurnIndex());
    }

    @Test
    void spectatorDisconnectDoesNotChangeThePlayersOrExposeTheirHands() throws Exception {
        GameRoom room = startTwoPlayerGame(session("player", "p1"));
        WebSocketSession spectator = session("spectator", "watcher");
        join(spectator, false);
        assertTrue(room.getSpectators().contains("watcher"));
        verify(spectator, never()).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("SYNC_HAND")));
        handler.afterConnectionClosed(spectator, CloseStatus.NO_CLOSE_FRAME);
        assertTrue(room.getPlayers().stream().allMatch(p -> "PLAYING".equals(p.getStatus()) && !p.isDisconnected()));
        join(session("spectator-recovered", "watcher"), false);
        assertEquals(1, room.getSpectators().size());
    }

    @Test
    void closingASessionAfterRoomRemovalReleasesItsRoomBindings() throws Exception {
        WebSocketSession peer = session("removed-room", "p1");
        startTwoPlayerGame(peer);
        service.getRoomMap().remove("room");
        handler.afterConnectionClosed(peer, CloseStatus.NORMAL);
        assertFalse(sessions().containsKey("room"));
        Map<?, ?> owners = (Map<?, ?>) ReflectionTestUtils.getField(handler, "activeSessions");
        assertFalse(owners.containsKey("room"));
    }

    @Test
    void lateGushouButtonCannotActInANewerWindow() throws Exception {
        WebSocketSession peer = session("late-gushou", "p1");
        GameRoom room = startTwoPlayerGame(peer);
        room.getPlayers().get(0).setSkill("GUSHOU");
        room.setLastPlayPlayerId("p2");
        room.setLastPlayedCards(new ArrayList<>(List.of(Card.getCard("♠", "3", 1))));
        var hand = List.copyOf(room.getPlayers().get(0).getHandCards());
        long oldStart = room.getCurrentTurnStartTime() - 1;
        handler.handleTextMessage(peer, new TextMessage("{\"type\":\"USE_GUSHOU\",\"roomId\":\"room\",\"actionStartTime\":" + oldStart + "}"));
        assertEquals(hand, room.getPlayers().get(0).getHandCards());
        assertEquals(0, room.getCurrentTurnIndex());
    }

    @Test
    void guestRecoveryRequiresTheOriginalHttpSessionEvenWhenTheNameIsReused() throws Exception {
        WebSocketSession guest = guestSession("guest-first", "http-one");
        join(guest, true);
        GameRoom room = service.getRoom("room");
        room.getPlayers().get(0).getHandCards().add(Card.getCard("♠", "3", 1));
        handler.afterConnectionClosed(guest, CloseStatus.NO_CLOSE_FRAME);

        WebSocketSession impostor = guestSession("guest-reused-name", "http-two");
        join(impostor, false);
        verify(impostor).close(CloseStatus.POLICY_VIOLATION);
        verify(impostor, never()).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("SYNC_HAND")));
        assertTrue(room.getPlayers().get(0).isDisconnected());

        WebSocketSession recovered = guestSession("guest-recovered", "http-one");
        join(recovered, false);
        assertFalse(room.getPlayers().get(0).isDisconnected());
        assertEquals(1, room.getPlayers().get(0).getHandCards().size());
        verify(recovered).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("SYNC_HAND")));
    }

    private WebSocketSession guestSession(String id, String httpSessionId) {
        WebSocketSession guest = session(id, "guest-name");
        guest.getAttributes().put(AuthSessionKeys.LOGIN_USER, SessionUser.guest("guest-name"));
        guest.getAttributes().put(AuthSessionKeys.GAME_HTTP_SESSION_ID, httpSessionId);
        return guest;
    }

    @Test
    void stalePageIdentityCannotCreateARoomAsTheNewCookieGuest() throws Exception {
        WebSocketSession stale = guestSession("stale-page", "shared-http");
        handler.handleTextMessage(stale, new TextMessage("{\"type\":\"JOIN_ROOM\",\"roomId\":\"room\",\"userId\":\"old-guest\",\"data\":{\"isCreating\":true}}"));

        assertNull(service.getRoom("room"));
        verify(stale).close(CloseStatus.POLICY_VIOLATION);
        verify(stale).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("FORCE_LOGOUT")));
    }

    @Test
    void replacedConnectionReceivesAnExplicitReasonAndNonRecoverableClose() throws Exception {
        WebSocketSession first = session("original-page", "p1");
        join(first, true);
        WebSocketSession second = session("new-page", "p1");
        join(second, false);

        verify(first).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("CONNECTION_REPLACED")));
        verify(first).close(argThat(status -> status.getCode() == 4001));
        assertEquals(1, service.getRoom("room").getPlayers().size());
        verify(second).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("SYNC_STATE")));
    }

    @Test
    void pageGuestHandshakeCarriesItsStableIdentity() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setQueryString("authToken=page-credential");
        SessionUser guest = new SessionUser(null, "guest-page", "guest-page", true, "visit-one");
        AuthService auth = mock(AuthService.class);
        when(auth.resolveTabAuthenticatedUser("page-credential")).thenReturn(guest);
        Map<String, Object> attributes = new HashMap<>();

        assertTrue(new AuthHandshakeInterceptor(auth).beforeHandshake(new ServletServerHttpRequest(request),
                new ServletServerHttpResponse(new MockHttpServletResponse()), handler, attributes));

        assertEquals("visit-one", attributes.get(AuthSessionKeys.GAME_GUEST_ID));
        assertSame(guest, attributes.get(AuthSessionKeys.LOGIN_USER));
    }

    @Test
    void guestRecoveryUsesVisitIdentityRatherThanSharedCookiesOrNickname() throws Exception {
        WebSocketSession original = pageGuestSession("original-visit", "visit-one");
        join(original, true);
        GameRoom room = service.getRoom("room");
        room.getPlayers().get(0).getHandCards().add(Card.getCard("♠", "3", 1));
        handler.afterConnectionClosed(original, CloseStatus.NO_CLOSE_FRAME);

        WebSocketSession reusedName = pageGuestSession("new-visit", "visit-two");
        join(reusedName, false);
        verify(reusedName).close(CloseStatus.POLICY_VIOLATION);
        verify(reusedName, never()).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("SYNC_HAND")));

        WebSocketSession recovered = session("same-visit-recovered", "guest-page");
        recovered.getAttributes().putAll(original.getAttributes());
        join(recovered, false);
        assertFalse(room.getPlayers().get(0).isDisconnected());
        assertEquals(1, room.getPlayers().get(0).getHandCards().size());
    }

    @Test
    void guestRevocationDoesNotCloseAnotherVisitWithAReusedNickname() throws Exception {
        WebSocketSession original = pageGuestSession("old-visit", "visit-one");
        WebSocketSession reusedName = pageGuestSession("new-visit", "visit-two");
        sessions().put("room", new CopyOnWriteArraySet<>(List.of(original, reusedName)));

        handler.forceLogoutGuestVisit("visit-one", "游客会话已结束，请重新进入");

        verify(original).close(CloseStatus.POLICY_VIOLATION);
        verify(reusedName, never()).close(any());
    }

    @Test
    void revokedGuestCannotUseAnAlreadyEstablishedSocket() throws Exception {
        WebSocketSession guest = pageGuestSession("revoked", "visit-one");
        join(guest, true);
        String token = tokens.issueToken((SessionUser) guest.getAttributes().get(AuthSessionKeys.LOGIN_USER));
        tokens.revokeToken(token);

        handler.handleTextMessage(guest, new TextMessage("{\"type\":\"PING\",\"roomId\":\"room\"}"));

        verify(guest).close(CloseStatus.POLICY_VIOLATION);
        verify(guest, never()).sendMessage(argThat(m -> m instanceof TextMessage t && t.getPayload().contains("PONG")));
    }

    private WebSocketSession pageGuestSession(String id, String visitId) {
        WebSocketSession guest = session(id, "guest-page");
        SessionUser user = new SessionUser(null, "guest-page", "guest-page", true, visitId);
        tokens.issueToken(user);
        guest.getAttributes().put(AuthSessionKeys.LOGIN_USER, user);
        guest.getAttributes().put(AuthSessionKeys.GAME_GUEST_ID, visitId);
        guest.getAttributes().put(AuthSessionKeys.GAME_HTTP_SESSION_ID, "shared-cookie-session");
        return guest;
    }

    @Test
    void guestHandshakeCarriesTheAuthenticatedHttpSessionIdentity() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        var session = request.getSession();
        SessionUser guest = SessionUser.guest("guest-handshake");
        session.setAttribute(AuthSessionKeys.LOGIN_USER, guest);
        Map<String, Object> attributes = new HashMap<>();
        AuthHandshakeInterceptor interceptor = new AuthHandshakeInterceptor(mock(AuthService.class));
        assertTrue(interceptor.beforeHandshake(new ServletServerHttpRequest(request),
                new ServletServerHttpResponse(new MockHttpServletResponse()), handler, attributes));
        assertSame(guest, attributes.get(AuthSessionKeys.LOGIN_USER));
        assertEquals(session.getId(), attributes.get(AuthSessionKeys.GAME_HTTP_SESSION_ID));
    }

    private GameRoom startTwoPlayerGame(WebSocketSession first) throws Exception {
        join(first, true);
        join(session("second", "p2"), false);
        GameRoom room = service.getRoom("room");
        room.getPlayers().get(1).setReady(true);
        service.startGame("room", "p1");
        room.setCurrentTurnIndex(0);
        return room;
    }

    private void join(WebSocketSession session, boolean create) throws Exception {
        handler.handleTextMessage(session, new TextMessage("{\"type\":\"JOIN_ROOM\",\"roomId\":\"room\",\"data\":{\"isCreating\":" + create + "}}"));
    }

    private void broadcast(String roomId) {
        ReflectionTestUtils.invokeMethod(handler, "broadcastToRoom", roomId, new TextMessage("{}"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, CopyOnWriteArraySet<WebSocketSession>> sessions() {
        return (Map<String, CopyOnWriteArraySet<WebSocketSession>>) ReflectionTestUtils.getField(handler, "roomSessions");
    }

    private WebSocketSession session(String id, String user) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(AuthSessionKeys.LOGIN_USER, new SessionUser(1L, user, user, false, "v1"));
        when(session.getAttributes()).thenReturn(attributes);
        return session;
    }
}
