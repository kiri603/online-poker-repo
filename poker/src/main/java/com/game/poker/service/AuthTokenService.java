package com.game.poker.service;

import com.game.poker.auth.SessionUser;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AuthTokenService {
    private static final long TOKEN_TTL_MILLIS = 12L * 60L * 60L * 1000L;

    private final Map<String, TokenEntry> tokenStore = new ConcurrentHashMap<>();
    private final Map<String, TokenEntry> guestVisits = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();

    public String issueToken(SessionUser sessionUser) {
        cleanupExpiredTokens();
        String token = generateRawToken();
        TokenEntry entry = new TokenEntry(sessionUser, System.currentTimeMillis() + TOKEN_TTL_MILLIS);
        tokenStore.put(token, entry);
        if (sessionUser.isGuest() && sessionUser.getSessionVersion() != null) {
            guestVisits.putIfAbsent(sessionUser.getSessionVersion(), entry);
        }
        return token;
    }

    public SessionUser resolveUser(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        TokenEntry entry = tokenStore.get(token);
        if (entry == null) {
            return null;
        }
        if (entry.expiresAt <= System.currentTimeMillis()
                || (entry.sessionUser.isGuest() && !isGuestSessionActive(entry.sessionUser))) {
            tokenStore.remove(token);
            return null;
        }
        return entry.sessionUser;
    }

    public void revokeToken(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        TokenEntry entry = tokenStore.remove(token);
        if (entry != null && entry.sessionUser.isGuest() && entry.sessionUser.getSessionVersion() != null) {
            String visitId = entry.sessionUser.getSessionVersion();
            guestVisits.remove(visitId);
            tokenStore.entrySet().removeIf(item -> item.getValue().sessionUser.isGuest()
                    && visitId.equals(item.getValue().sessionUser.getSessionVersion()));
        }
    }

    public boolean isGuestSessionActive(SessionUser guest) {
        if (guest.getSessionVersion() == null) return false;
        TokenEntry visit = guestVisits.get(guest.getSessionVersion());
        if (visit == null) return false;
        if (visit.expiresAt <= System.currentTimeMillis()) {
            guestVisits.remove(guest.getSessionVersion(), visit);
            return false;
        }
        return visit.sessionUser.getUsername().equals(guest.getUsername());
    }

    public java.util.Set<String> getActiveGuestUsernames() {
        cleanupExpiredTokens();
        return guestVisits.values().stream().map(entry -> entry.sessionUser.getUsername())
                .collect(java.util.stream.Collectors.toSet());
    }

    private void cleanupExpiredTokens() {
        long now = System.currentTimeMillis();
        tokenStore.entrySet().removeIf(entry -> entry.getValue().expiresAt <= now);
        guestVisits.entrySet().removeIf(entry -> entry.getValue().expiresAt <= now);
    }

    private String generateRawToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes) + "." + Instant.now().toEpochMilli();
    }

    private record TokenEntry(SessionUser sessionUser, long expiresAt) {
    }
}
