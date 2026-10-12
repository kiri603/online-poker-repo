package com.game.poker.service;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WechatSchemaMigrationTest {
    @Test void upgradesExistingAccountsWithoutChangingAnyProgressReferences() {
        String url="jdbc:h2:mem:migration"+UUID.randomUUID()+";MODE=MYSQL;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url,"sa","").locations("classpath:db/migration/common").target("3").load().migrate();
        JdbcTemplate jdbc=new JdbcTemplate(new DriverManagerDataSource(url,"sa",""));
        jdbc.update("INSERT INTO user_account(id,username,password_hash,nickname,status,created_at,updated_at) VALUES (42,'OldPlayer','hash','将军','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO user_stats(user_id,experience,total_games,wins,losses,last_daily_sign_in_at,updated_at) VALUES (42,777,9,5,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO friend_relation(user_a_id,user_b_id,created_at) VALUES ('OldPlayer','Friend',CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO direct_message(from_user_id,to_user_id,content,created_at) VALUES ('OldPlayer','Friend','你好',CURRENT_TIMESTAMP)");
        var stats=jdbc.queryForMap("SELECT * FROM user_stats WHERE user_id=42");
        Flyway.configure().dataSource(url,"sa","").locations("classpath:db/migration/common").load().migrate();
        assertThat(jdbc.queryForObject("SELECT username FROM user_account WHERE id=42",String.class)).isEqualTo("OldPlayer");
        assertThat(jdbc.queryForObject("SELECT login_name FROM user_account WHERE id=42",String.class)).isEqualTo("OldPlayer");
        assertThat(jdbc.queryForObject("SELECT login_name_key FROM user_account WHERE id=42",String.class)).isEqualTo("oldplayer");
        assertThat(jdbc.queryForMap("SELECT * FROM user_stats WHERE user_id=42")).isEqualTo(stats);
        assertThat(jdbc.queryForObject("SELECT user_a_id FROM friend_relation",String.class)).isEqualTo("OldPlayer");
        assertThat(jdbc.queryForObject("SELECT from_user_id FROM direct_message",String.class)).isEqualTo("OldPlayer");
        jdbc.update("INSERT INTO user_account(id,username,nickname,status,created_at,updated_at) VALUES (43,'wx_new',?,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)","😀".repeat(64));
        jdbc.update("INSERT INTO wechat_identity(user_id,app_id,openid,created_at) VALUES (42,'wx-app','CaseId',CURRENT_TIMESTAMP),(43,'wx-app','caseid',CURRENT_TIMESTAMP)");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wechat_identity",Integer.class)).isEqualTo(2);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("INSERT INTO wechat_identity(user_id,app_id,openid,created_at) VALUES (42,'wx-app','third',CURRENT_TIMESTAMP)"));
    }
}
