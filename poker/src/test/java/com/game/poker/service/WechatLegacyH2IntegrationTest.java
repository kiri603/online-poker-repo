package com.game.poker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.repository.UserAccountRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.profiles.active=local-h2", "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=update", "app.wechat.enabled=true", "app.wechat.app-id=wx-legacy-test"
})
class WechatLegacyH2IntegrationTest {
    private static final String URL = createLegacyDatabase();

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> URL);
    }

    private static String createLegacyDatabase() {
        String url = "jdbc:h2:mem:wechat_legacy_" + UUID.randomUUID()
                + ";MODE=MYSQL;DB_CLOSE_DELAY=-1;NON_KEYWORDS=USER";
        Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration/common")
                .target("3").load().migrate();
        JdbcTemplate db = new JdbcTemplate(new DriverManagerDataSource(url, "sa", ""));
        db.update("INSERT INTO user_account(username,password_hash,nickname,avatar_id,status,created_at,updated_at) "
                + "VALUES ('OldPlayer','fixture-hash','旧将军','xiaotao-smile','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        Long id = db.queryForObject("SELECT id FROM user_account WHERE username='OldPlayer'", Long.class);
        db.update("INSERT INTO user_stats(user_id,experience,total_games,wins,losses,updated_at) "
                + "VALUES (?,777,9,5,4,CURRENT_TIMESTAMP)", id);
        return url;
    }

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate db;
    @Autowired UserAccountRepository accounts;
    @MockitoBean WechatClient wechat;

    @Test
    void populatedHibernateDatabaseSupportsWechatRegistrationAndKeepsLegacyProgress() throws Exception {
        when(wechat.exchange(anyString())).thenReturn(
                new WechatClient.Identity("wx-legacy-test", "new-wechat-player", null, "fixture-session-key"));
        var mvc = MockMvcBuilders.webAppContextSetup(context).build();
        var json = new ObjectMapper();
        var session = new MockHttpSession();
        var exchanged = mvc.perform(post("/api/auth/wechat/exchange").session(session)
                        .contentType("application/json").content("{\"code\":\"fixture-code\",\"purpose\":\"AUTH\"}"))
                .andExpect(status().isOk()).andReturn();
        String ticket = json.readTree(exchanged.getResponse().getContentAsString()).path("ticket").asText();
        var registered = mvc.perform(post("/api/auth/wechat/register").session(session)
                        .contentType("application/json").content(json.writeValueAsBytes(Map.of("ticket", ticket))))
                .andExpect(status().isOk()).andReturn();
        var user = json.readTree(registered.getResponse().getContentAsString());
        assertThat(user.path("username").asText()).startsWith("wx_");
        assertThat(user.path("passwordLoginEnabled").asBoolean()).isFalse();
        assertThat(user.path("wechatBound").asBoolean()).isTrue();
        mvc.perform(get("/api/auth/me").header("X-Poker-Auth-Token", user.path("tabToken").asText()))
                .andExpect(status().isOk());

        var old = accounts.findByLoginNameKey("oldplayer").orElseThrow();
        assertThat(old.getUsername()).isEqualTo("OldPlayer");
        assertThat(old.getNickname()).isEqualTo("旧将军");
        assertThat(old.getAvatarSource()).isEqualTo("CATALOG");
        assertThat(old.getAvatarId()).isEqualTo("xiaotao-smile");
        assertThat(db.queryForObject("SELECT experience FROM user_stats WHERE user_id=?", Integer.class, old.getId()))
                .isEqualTo(777);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM user_stats", Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM wechat_identity", Integer.class)).isEqualTo(1);
    }
}
