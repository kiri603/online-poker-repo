import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.*;
import java.util.HexFormat;
import java.util.LinkedHashMap;

class WechatDataCheck {
    public static void main(String[] args) throws Exception {
        try (Connection db = DriverManager.getConnection(args[0], "sa", "")) {
            db.setReadOnly(true);
            try (var statement = db.createStatement(); var rows = statement.executeQuery(
                    "SELECT COUNT(*) FROM (SELECT LOWER(username) FROM user_account GROUP BY LOWER(username) HAVING COUNT(*)>1)")) {
                rows.next();
                if (rows.getLong(1) != 0) throw new IllegalStateException("Conflicting legacy login names; deployment stopped");
            }
            if (args.length > 1 && "upgraded".equals(args[1])) {
                try (var statement = db.createStatement(); var columns = statement.executeQuery(
                        "SELECT avatar_source,wechat_avatar_asset_id,wechat_avatar_key,wechat_avatar_etag FROM user_account WHERE 1=0")) {
                    // Preparing this query rejects partially upgraded account tables.
                }
                try (var columns = db.getMetaData().getColumns(null, null, "USER_ACCOUNT", "AVATAR_SOURCE")) {
                    if (!columns.next() || columns.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls
                            || columns.getString("COLUMN_DEF") == null || !columns.getString("COLUMN_DEF").contains("CATALOG")) {
                        throw new IllegalStateException("Avatar source default or constraint missing; deployment stopped");
                    }
                }
                try (var statement = db.createStatement(); var rows = statement.executeQuery(
                        "SELECT COUNT(*) FROM user_account WHERE password_hash IS NOT NULL AND (login_name IS NULL OR login_name_key IS NULL OR login_name_key <> LOWER(login_name))")) {
                    rows.next();
                    if (rows.getLong(1) != 0) throw new IllegalStateException("Legacy password login backfill incomplete; deployment stopped");
                }
                try (var statement = db.createStatement(); var rows = statement.executeQuery("SELECT COUNT(*) FROM wechat_identity")) {
                    rows.next();
                }
            }
            var queries = new LinkedHashMap<String, String>();
            queries.put("user_account", "SELECT id,username,password_hash,nickname,avatar_id,created_at FROM user_account ORDER BY id");
            for (String table : new String[]{"user_stats", "user_login_log", "friend_relation", "friend_request", "direct_message", "room_invite", "game_record", "game_record_participant"})
                queries.put(table, "SELECT * FROM " + table + " ORDER BY 1");
            for (var query : queries.entrySet()) {
                var hash = MessageDigest.getInstance("SHA-256");
                long count = 0;
                try (var statement = db.createStatement(); var rows = statement.executeQuery(query.getValue())) {
                    int columns = rows.getMetaData().getColumnCount();
                    while (rows.next()) {
                        count++;
                        for (int column = 1; column <= columns; column++) {
                            Object raw = rows.getObject(column);
                            hash.update((byte) (raw == null ? 0 : 1));
                            String value = String.valueOf(raw);
                            byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
                            hash.update(Integer.toString(bytes.length).getBytes(StandardCharsets.US_ASCII));
                            hash.update((byte)':');
                            hash.update(bytes);
                        }
                        hash.update((byte)'\n');
                    }
                }
                System.out.println(query.getKey() + " count=" + count + " sha256=" + HexFormat.of().formatHex(hash.digest()));
            }
        }
    }
}
