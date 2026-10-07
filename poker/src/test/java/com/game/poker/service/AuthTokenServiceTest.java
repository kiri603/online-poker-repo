package com.game.poker.service;

import com.game.poker.auth.SessionUser;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AuthTokenServiceTest {
    @Test
    void revokingOneVisitLeavesAnotherVisitWithTheSameNicknameValid() {
        AuthTokenService tokens = new AuthTokenService();
        SessionUser first = guest("visit-one");
        SessionUser second = guest("visit-two");
        String firstToken = tokens.issueToken(first);
        String secondToken = tokens.issueToken(second);

        tokens.revokeToken(firstToken);

        assertNull(tokens.resolveUser(firstToken));
        assertFalse(tokens.isGuestSessionActive(first));
        assertSame(second, tokens.resolveUser(secondToken));
        assertTrue(tokens.isGuestSessionActive(second));
    }

    @Test
    void expiredVisitLosesItsCredentialAndNicknameReservation() throws Exception {
        AuthTokenService tokens = new AuthTokenService();
        SessionUser guest = guest("visit-one");
        String token = tokens.issueToken(guest);
        Map<String, Object> tokenStore = field(tokens, "tokenStore");
        Map<String, Object> visits = field(tokens, "guestVisits");
        var constructor = tokenStore.get(token).getClass().getDeclaredConstructor(SessionUser.class, long.class);
        constructor.setAccessible(true);
        Object expired = constructor.newInstance(guest, System.currentTimeMillis() - 1);
        tokenStore.put(token, expired);
        visits.put(guest.getSessionVersion(), expired);

        assertTrue(tokens.getActiveGuestUsernames().isEmpty());
        assertNull(tokens.resolveUser(token));
        assertFalse(tokens.isGuestSessionActive(guest));
        assertTrue(tokenStore.isEmpty());
        assertTrue(visits.isEmpty());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> field(AuthTokenService service, String name) {
        return (Map<String, Object>) ReflectionTestUtils.getField(service, name);
    }

    private SessionUser guest(String visit) {
        return new SessionUser(null, "guest-name", "guest-name", true, visit);
    }
}
