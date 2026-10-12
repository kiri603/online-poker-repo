package com.game.poker.service;

import com.game.poker.auth.AuthException;
import com.game.poker.dto.auth.AuthRequest;
import com.game.poker.dto.auth.AuthUserResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
class LoginNameIntegrationTest {
    @Autowired AuthService auth;
    @Autowired CaptchaService captcha;
    @Autowired JdbcTemplate jdbc;

    private AuthRequest request(MockHttpSession session, String name) {
        auth.createCaptcha(session);
        AuthRequest request = new AuthRequest();
        request.setUsername(name);
        request.setPassword("abc12345");
        request.setCaptchaCode(captcha.peekCaptchaCodeForTesting(session.getId()));
        return request;
    }

    @Test
    void loginAliasKeepsTheOriginalPlayerAndStatisticsIds() {
        String playerId = "ln" + System.nanoTime();
        MockHttpSession first = new MockHttpSession();
        AuthUserResponse registered = auth.register(request(first, playerId), first,
                new MockHttpServletRequest(), new MockHttpServletResponse(), "alias-test", "JUnit");
        String alias = "alias" + System.currentTimeMillis();
        jdbc.update("UPDATE user_account SET login_name = ?, login_name_key = ? WHERE id = ?",
                alias, alias.toLowerCase(), registered.getId());
        MockHttpSession second = new MockHttpSession();
        AuthUserResponse loggedIn = auth.login(request(second, alias), second,
                new MockHttpServletRequest(), new MockHttpServletResponse(), "alias-test", "JUnit");
        assertThat(loggedIn.getId()).isEqualTo(registered.getId());
        assertThat(loggedIn.getUsername()).isEqualTo(playerId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_stats WHERE user_id = ?", Integer.class,
                registered.getId())).isEqualTo(1);
    }

    @Test
    void passwordlessAccountCannotAuthenticateUsingItsPlayerId() {
        String playerId = "np" + System.nanoTime();
        jdbc.update("INSERT INTO user_account(username, nickname, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                playerId, "新晋将领");
        MockHttpSession session = new MockHttpSession();
        assertThrows(AuthException.class, () -> auth.login(request(session, playerId), session,
                new MockHttpServletRequest(), new MockHttpServletResponse(), "passwordless-test", "JUnit"));
    }
}
