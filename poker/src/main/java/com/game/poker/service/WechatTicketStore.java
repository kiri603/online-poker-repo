package com.game.poker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.auth.AuthException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class WechatTicketStore {
    public enum Purpose { AUTH, CREDENTIALS, PROFILE }
    public record Ticket(WechatClient.Identity identity, Purpose purpose, Long userId, String sessionVersion, long expiresAt) {}
    private final boolean redisEnabled;
    private final StringRedisTemplate redis;
    private final ObjectMapper json = new ObjectMapper();
    private final Map<String, Ticket> local = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final java.time.Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public WechatTicketStore(@Value("${app.auth.redis-enabled:false}") boolean redisEnabled, StringRedisTemplate redis) {
        this(redisEnabled, redis, java.time.Clock.systemUTC());
    }
    WechatTicketStore(boolean redisEnabled, StringRedisTemplate redis, java.time.Clock clock) {
        this.redisEnabled = redisEnabled; this.redis = redis; this.clock = clock;
    }
    public String issue(WechatClient.Identity identity, Purpose purpose, Long userId, String sessionVersion) {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Ticket ticket = new Ticket(identity, purpose, userId, sessionVersion, clock.millis() + 300_000);
        if (redisEnabled) {
            try { redis.opsForValue().set("wechat:ticket:" + value, json.writeValueAsString(ticket), Duration.ofMinutes(5)); }
            catch (Exception e) { throw unavailable(); }
        } else {
            local.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= clock.millis());
            local.put(value, ticket);
        }
        return value;
    }
    public Ticket consume(String value, Purpose purpose) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) throw invalid();
        Ticket ticket;
        if (redisEnabled) {
            try {
                // GETDEL is atomic: a ticket cannot succeed twice, including across server instances.
                String raw = redis.opsForValue().getAndDelete("wechat:ticket:" + value);
                ticket = raw == null ? null : json.readValue(raw, Ticket.class);
            } catch (Exception e) { throw unavailable(); }
        } else ticket = local.remove(value);
        if (ticket == null || ticket.expiresAt() <= clock.millis() || ticket.purpose() != purpose) throw invalid();
        return ticket;
    }
    private AuthException invalid() { return new AuthException(HttpStatus.BAD_REQUEST, "微信票据已失效，请重新获取微信凭证"); }
    private AuthException unavailable() { return new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "微信凭证服务暂时不可用"); }
}
