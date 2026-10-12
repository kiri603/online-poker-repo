package com.game.poker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Connection;
import java.util.Locale;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PokerServerApplication {
    private static final Logger log = LoggerFactory.getLogger(PokerServerApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(PokerServerApplication.class, args);
    }

    @Bean
    ApplicationRunner legacySchemaCompatibilityRunner(JdbcTemplate jdbcTemplate) {
        return args -> {
            String databaseProduct;
            try (Connection connection = jdbcTemplate.getDataSource().getConnection()) {
                databaseProduct = connection.getMetaData().getDatabaseProductName();
            }
            if (databaseProduct == null || !databaseProduct.toLowerCase(Locale.ROOT).contains("h2")) {
                return;
            }

            ensureColumn(jdbcTemplate, "USER_STATS", "LAST_DAILY_SIGN_IN_AT", "TIMESTAMP");
            ensureColumn(jdbcTemplate, "USER_STATS", "EXPERIENCE", "INTEGER DEFAULT 0");
            jdbcTemplate.execute("UPDATE USER_STATS SET EXPERIENCE = 0 WHERE EXPERIENCE IS NULL");
            jdbcTemplate.execute("ALTER TABLE USER_STATS ALTER COLUMN EXPERIENCE SET DEFAULT 0");
            jdbcTemplate.execute("ALTER TABLE USER_STATS ALTER COLUMN EXPERIENCE SET NOT NULL");
            // local-h2 uses Hibernate update rather than Flyway; preserve old password accounts there too.
            ensureColumn(jdbcTemplate, "USER_ACCOUNT", "AVATAR_SOURCE", "VARCHAR(16) DEFAULT 'CATALOG'");
            jdbcTemplate.update("UPDATE USER_ACCOUNT SET AVATAR_SOURCE='CATALOG' WHERE AVATAR_SOURCE IS NULL");
            jdbcTemplate.execute("ALTER TABLE USER_ACCOUNT ALTER COLUMN AVATAR_SOURCE SET DEFAULT 'CATALOG'");
            jdbcTemplate.execute("ALTER TABLE USER_ACCOUNT ALTER COLUMN AVATAR_SOURCE SET NOT NULL");
            jdbcTemplate.execute("ALTER TABLE USER_ACCOUNT ALTER COLUMN PASSWORD_HASH DROP NOT NULL");
            jdbcTemplate.execute("ALTER TABLE USER_ACCOUNT ALTER COLUMN NICKNAME VARCHAR(128) NOT NULL");
            jdbcTemplate.update("UPDATE USER_ACCOUNT SET LOGIN_NAME=USERNAME, LOGIN_NAME_KEY=LOWER(USERNAME) WHERE LOGIN_NAME IS NULL AND PASSWORD_HASH IS NOT NULL");
            log.info("已完成 H2 旧版账号和统计表兼容迁移检查");
        };
    }

    private void ensureColumn(JdbcTemplate jdbcTemplate, String tableName, String columnName, String definition) {
        Integer count = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_NAME = ?
                          AND COLUMN_NAME = ?
                        """,
                Integer.class,
                tableName,
                columnName
        );
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + definition);
        log.info("已为表 {} 补充兼容列 {}", tableName, columnName);
    }

}
