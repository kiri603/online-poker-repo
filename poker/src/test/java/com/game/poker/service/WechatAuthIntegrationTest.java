package com.game.poker.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.auth.AuthException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.util.Map;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest(properties = {"app.wechat.enabled=true", "app.wechat.app-id=wx-test"})
class WechatAuthIntegrationTest {
    @Autowired WebApplicationContext context;
    @Autowired CaptchaService captcha;
    @Autowired AuthService auth;
    @Autowired UserService users;
    @Autowired JdbcTemplate jdbc;
    @Autowired WechatTicketStore tickets;
    @MockitoBean WechatClient wechat;
    MockMvc mvc;
    ObjectMapper json = new ObjectMapper();

    @BeforeEach void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        when(wechat.exchange(anyString())).thenAnswer(invocation ->
                new WechatClient.Identity("wx-test", invocation.getArgument(0), null, "server-only-secret"));
    }
    JsonNode post(String path, MockHttpSession session, Map<String, ?> body, int expected) throws Exception {
        var result = mvc.perform(postRequest(path, session, body)).andReturn();
        assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(expected);
        return json.readTree(result.getResponse().getContentAsString());
    }
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder postRequest(String path, MockHttpSession session, Map<String, ?> body) throws Exception {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth" + path)
                .session(session).header("X-Forwarded-For", "test-" + session.getId()).contentType("application/json")
                .content(json.writeValueAsBytes(body));
    }
    String ticket(MockHttpSession session, String openid, String purpose) throws Exception {
        var exchange = post("/wechat/exchange", session, Map.of("code", openid, "purpose", purpose), 200);
        assertThat(exchange.has("openid")).isFalse();
        assertThat(exchange.has("sessionKey")).isFalse();
        return exchange.path("ticket").asText();
    }
    String captchaCode(MockHttpSession session) {
        auth.createCaptcha(session);
        return captcha.peekCaptchaCodeForTesting(session.getId());
    }
    String unique() { return "w" + System.nanoTime(); }
    JsonNode registerWechat(MockHttpSession session, String openid) throws Exception {
        return post("/wechat/register", session, Map.of("ticket", ticket(session, openid, "AUTH")), 200);
    }

    @Test void passwordlessAccountCanEnableWebLoginWithoutChangingPlayerOrStats() throws Exception {
        var session = new MockHttpSession(); String openid = unique();
        var created = registerWechat(session, openid);
        assertThat(created.path("passwordLoginEnabled").asBoolean()).isFalse();
        assertThat(created.path("wechatBound").asBoolean()).isTrue();
        String alias = unique();
        post("/credentials", session, Map.of("ticket", ticket(session, openid, "CREDENTIALS"),
                "loginName", alias, "password", "abc12345"), 200);
        var browser = new MockHttpSession();
        var web = post("/login", browser, Map.of("username", alias, "password", "abc12345", "captchaCode", captchaCode(browser)), 200);
        assertThat(web.path("id")).isEqualTo(created.path("id"));
        assertThat(web.path("username")).isEqualTo(created.path("username"));
        assertThat(web.path("loginName").asText()).isEqualTo(alias);
        assertThat(web.path("wechatBound").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_stats WHERE user_id=?", Integer.class, created.path("id").asLong())).isEqualTo(1);
        mvc.perform(get("/api/auth/me").header("X-Poker-Auth-Token", created.path("tabToken").asText()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        var next = new MockHttpSession();
        var wx = post("/wechat/login", next, Map.of("ticket", ticket(next, openid, "AUTH")), 200);
        assertThat(wx.path("id")).isEqualTo(created.path("id"));
        mvc.perform(get("/api/auth/me").header("X-Poker-Auth-Token", web.path("tabToken").asText()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
    }
    @Test void bindingKeepsOldProgressAndDoesNotOverwriteAnExistingBinding() throws Exception {
        var session = new MockHttpSession(); String name = unique(), openid = unique();
        var old = post("/register", session, Map.of("username", name, "password", "abc12345", "captchaCode", captchaCode(session)), 200);
        jdbc.update("UPDATE user_stats SET experience=777, total_games=9, wins=5, losses=4 WHERE user_id=?", old.path("id").asLong());
        jdbc.update("UPDATE user_stats SET last_daily_sign_in_at=CURRENT_TIMESTAMP WHERE user_id=?", old.path("id").asLong());
        String friend=users.createUser(unique(), "fixture-hash").getUsername();
        jdbc.update("INSERT INTO friend_relation(user_a_id,user_b_id,created_at) VALUES (?,?,CURRENT_TIMESTAMP)", name, friend);
        jdbc.update("INSERT INTO direct_message(from_user_id,to_user_id,content,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)", name, friend, "旧私聊");
        jdbc.update("INSERT INTO game_record(room_id,mode,player_count,winner_user_id,started_at,ended_at,created_at) VALUES (?,'CLASSIC',2,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", name, name);
        Long recordId=jdbc.queryForObject("SELECT id FROM game_record WHERE room_id=?",Long.class,name);
        jdbc.update("INSERT INTO game_record_participant(game_record_id,user_id,result) VALUES (?,?,'WIN')",recordId,name);
        var beforeStats=jdbc.queryForMap("SELECT * FROM user_stats WHERE user_id=?",old.path("id").asLong());
        var bound = post("/wechat/bind", session, Map.of("ticket", ticket(session, openid, "AUTH"),
                "loginName", name, "password", "abc12345", "captchaCode", captchaCode(session)), 200);
        assertThat(bound.path("id")).isEqualTo(old.path("id"));
        assertThat(bound.path("username").asText()).isEqualTo(name);
        assertThat(jdbc.queryForObject("SELECT experience FROM user_stats WHERE user_id=?", Integer.class, old.path("id").asLong())).isEqualTo(777);
        assertThat(jdbc.queryForMap("SELECT * FROM user_stats WHERE user_id=?",old.path("id").asLong())).isEqualTo(beforeStats);
        assertThat(jdbc.queryForObject("SELECT user_b_id FROM friend_relation WHERE user_a_id=?",String.class,name)).isEqualTo(friend);
        assertThat(jdbc.queryForObject("SELECT content FROM direct_message WHERE from_user_id=?",String.class,name)).isEqualTo("旧私聊");
        assertThat(jdbc.queryForObject("SELECT user_id FROM game_record_participant WHERE game_record_id=?",String.class,recordId)).isEqualTo(name);
        var other = new MockHttpSession();
        post("/wechat/bind", other, Map.of("ticket", ticket(other, unique(), "AUTH"),
                "loginName", name, "password", "abc12345", "captchaCode", captchaCode(other)), 409);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wechat_identity WHERE user_id=?", Integer.class, old.path("id").asLong())).isEqualTo(1);
    }
    @Test void wrongPasswordOrWrongCurrentAccountCannotBind() throws Exception {
        var first = new MockHttpSession(); String name = unique();
        var old = post("/register", first, Map.of("username", name, "password", "abc12345", "captchaCode", captchaCode(first)), 200);
        var second = new MockHttpSession();
        registerWechat(second, unique());
        post("/wechat/bind", second, Map.of("ticket", ticket(second, unique(), "AUTH"),
                "loginName", name, "password", "abc12345", "captchaCode", captchaCode(second)), 403);
        var login = new MockHttpSession();
        post("/wechat/bind", login, Map.of("ticket", ticket(login, unique(), "AUTH"),
                "loginName", name, "password", "wrong12345", "captchaCode", captchaCode(login)), 401);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wechat_identity WHERE user_id=?", Integer.class, old.path("id").asLong())).isZero();
    }
    @Test void repeatedOrConcurrentRegistrationLeavesOneAccountAndBinding() throws Exception {
        int beforeAccounts=jdbc.queryForObject("SELECT COUNT(*) FROM user_account",Integer.class);
        int beforeStats=jdbc.queryForObject("SELECT COUNT(*) FROM user_stats",Integer.class);
        String openid = unique(); var first = new MockHttpSession(); var second = new MockHttpSession();
        String a = ticket(first, openid, "AUTH"), b = ticket(second, openid, "AUTH");
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var fa = pool.submit(() -> { gate.await(); return mvc.perform(postRequest("/wechat/register", first, Map.of("ticket", a))).andReturn().getResponse().getStatus(); });
            var fb = pool.submit(() -> { gate.await(); return mvc.perform(postRequest("/wechat/register", second, Map.of("ticket", b))).andReturn().getResponse().getStatus(); });
            gate.countDown();
            assertThat(java.util.List.of(fa.get(15, TimeUnit.SECONDS), fb.get(15, TimeUnit.SECONDS))).containsExactlyInAnyOrder(200, 409);
        }
        post("/wechat/register", new MockHttpSession(), Map.of("ticket", a), 400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wechat_identity WHERE app_id='wx-test' AND openid=?", Integer.class, openid)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_account WHERE id IN (SELECT user_id FROM wechat_identity WHERE openid=?)", Integer.class, openid)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_account",Integer.class)).isEqualTo(beforeAccounts+1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_stats",Integer.class)).isEqualTo(beforeStats+1);
    }
    @Test void wrongPurposeAndUnknownTicketsAreRejected() {
        String value = tickets.issue(new WechatClient.Identity("wx-test", unique(), null, "key"), WechatTicketStore.Purpose.PROFILE, 1L, "version");
        assertThrows(AuthException.class, () -> tickets.consume(value, WechatTicketStore.Purpose.AUTH));
        assertThrows(AuthException.class, () -> tickets.consume(value, WechatTicketStore.Purpose.PROFILE));
        assertThrows(AuthException.class, () -> tickets.consume("A".repeat(43), WechatTicketStore.Purpose.AUTH));
    }
}
