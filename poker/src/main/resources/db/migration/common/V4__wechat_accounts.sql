ALTER TABLE user_account ADD COLUMN login_name VARCHAR(20) NULL;
ALTER TABLE user_account ADD COLUMN login_name_key VARCHAR(20) NULL;
UPDATE user_account SET login_name = username, login_name_key = LOWER(username) WHERE password_hash IS NOT NULL;
CREATE UNIQUE INDEX uk_user_account_login_name_key ON user_account (login_name_key);
ALTER TABLE user_account MODIFY COLUMN password_hash VARCHAR(100) NULL;
-- H2 counts UTF-16 units; 128 storage units support 64 Unicode code points including emoji.
ALTER TABLE user_account MODIFY COLUMN nickname VARCHAR(128) NOT NULL;
ALTER TABLE user_account ADD COLUMN avatar_source VARCHAR(16) NOT NULL DEFAULT 'CATALOG';
ALTER TABLE user_account ADD COLUMN wechat_avatar_asset_id VARCHAR(36) NULL;
ALTER TABLE user_account ADD COLUMN wechat_avatar_key VARCHAR(255) NULL;
ALTER TABLE user_account ADD COLUMN wechat_avatar_etag VARCHAR(64) NULL;
CREATE UNIQUE INDEX uk_user_account_wechat_avatar_asset ON user_account (wechat_avatar_asset_id);

CREATE TABLE wechat_identity (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    app_id VARCHAR(64) NOT NULL,
    openid VARCHAR(128) NOT NULL,
    unionid VARCHAR(128) NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_wechat_app_openid UNIQUE (app_id, openid),
    CONSTRAINT uk_wechat_user_app UNIQUE (user_id, app_id),
    CONSTRAINT fk_wechat_identity_account FOREIGN KEY (user_id) REFERENCES user_account (id)
);
