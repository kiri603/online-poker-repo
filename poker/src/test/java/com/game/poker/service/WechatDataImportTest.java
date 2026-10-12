package com.game.poker.service;

import com.game.poker.config.DataMigrationProperties;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.ObjectMapper;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.Mockito.*;

/** Tests the import algorithm against H2, including lowercase target tables. Not a MySQL certification. */
class WechatDataImportTest {
    @TempDir Path reports;

    @Test void importsLegacyDatabaseWithoutWechatTableAndBackfillsLoginNames() throws Exception {
        verifyImport(false);
    }

    @Test void importsPasswordlessAccountWithWechatBindingAndKeepsProgressReferences() throws Exception {
        verifyImport(true);
    }

    private void verifyImport(boolean wechatAccount) throws Exception {
        String sourceUrl="jdbc:h2:mem:source"+UUID.randomUUID()+";MODE=MYSQL;DB_CLOSE_DELAY=-1";
        String targetUrl="jdbc:h2:mem:target"+UUID.randomUUID()+";MODE=MYSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(sourceUrl,"sa","").locations("classpath:db/migration/common")
                .target(wechatAccount?"4":"3").load().migrate();
        Flyway.configure().dataSource(targetUrl,"sa","").locations("classpath:db/migration/common").load().migrate();
        JdbcTemplate source=new JdbcTemplate(new DriverManagerDataSource(sourceUrl,"sa",""));
        source.update("INSERT INTO user_account(id,username,password_hash,nickname,status,created_at,updated_at) VALUES (42,'OldPlayer',?,'将军','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",wechatAccount?null:"hash");
        source.update("INSERT INTO user_stats(user_id,experience,total_games,wins,losses,last_daily_sign_in_at,updated_at) VALUES (42,777,9,5,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        source.update("INSERT INTO friend_relation(user_a_id,user_b_id,created_at) VALUES ('OldPlayer','Friend',CURRENT_TIMESTAMP)");
        source.update("INSERT INTO direct_message(from_user_id,to_user_id,content,created_at) VALUES ('OldPlayer','Friend','你好',CURRENT_TIMESTAMP)");
        if(wechatAccount)source.update("INSERT INTO wechat_identity(user_id,app_id,openid,created_at) VALUES (42,'wx-app','CaseId',CURRENT_TIMESTAMP)");

        DriverManagerDataSource actual=new DriverManagerDataSource(targetUrl,"sa","");
        DataSource target=mock(DataSource.class);
        when(target.getConnection()).thenAnswer(invocation->{
            Connection real=actual.getConnection();
            DatabaseMetaData metadata=mock(DatabaseMetaData.class,delegatesTo(real.getMetaData()));
            doReturn("MySQL").when(metadata).getDatabaseProductName();
            Connection connection=mock(Connection.class,delegatesTo(real));
            doReturn(metadata).when(connection).getMetaData();
            return connection;
        });
        DataMigrationProperties properties=new DataMigrationProperties();
        properties.getH2().setUrl(sourceUrl);properties.getH2().setUsername("sa");properties.getH2().setPassword("");
        properties.setReportDirectory(reports.toString());
        var report=new DataMigrationService(target,properties,new ObjectMapper()).migrateH2ToCurrentDataSource();
        JdbcTemplate jdbc=new JdbcTemplate(actual);
        assertThat(report.isSuccess()).isTrue();
        assertThat(report.getSourceCounts()).isEqualTo(report.getTargetCountsAfter());
        assertThat(jdbc.queryForObject("SELECT username FROM user_account WHERE id=42",String.class)).isEqualTo("OldPlayer");
        assertThat(jdbc.queryForObject("SELECT login_name FROM user_account WHERE id=42",String.class)).isEqualTo(wechatAccount?null:"OldPlayer");
        assertThat(jdbc.queryForObject("SELECT login_name_key FROM user_account WHERE id=42",String.class)).isEqualTo(wechatAccount?null:"oldplayer");
        assertThat(jdbc.queryForMap("SELECT * FROM user_stats WHERE user_id=42").get("EXPERIENCE".toLowerCase())).isEqualTo(777);
        assertThat(jdbc.queryForObject("SELECT user_a_id FROM friend_relation",String.class)).isEqualTo("OldPlayer");
        assertThat(jdbc.queryForObject("SELECT from_user_id FROM direct_message",String.class)).isEqualTo("OldPlayer");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wechat_identity",Integer.class)).isEqualTo(wechatAccount?1:0);
        if(wechatAccount)assertThat(jdbc.queryForObject("SELECT openid FROM wechat_identity WHERE user_id=42",String.class)).isEqualTo("CaseId");
    }
}
