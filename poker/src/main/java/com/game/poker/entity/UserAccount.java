package com.game.poker.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnDefault;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_account")
public class UserAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String username;

    @Column(name = "login_name", length = 20)
    private String loginName;

    @Column(name = "login_name_key", unique = true, length = 20)
    private String loginNameKey;

    @Column(name = "password_hash", length = 100)
    private String passwordHash;

    @Column(nullable = false, length = 128)
    private String nickname;

    @Column(name = "avatar_id", length = 40)
    private String avatarId;

    @Column(name = "avatar_source", nullable = false, length = 16)
    @ColumnDefault("'CATALOG'")
    private String avatarSource = "CATALOG";

    @Column(name = "wechat_avatar_asset_id", unique = true, length = 36)
    private String wechatAvatarAssetId;

    @Column(name = "wechat_avatar_key", length = 255)
    private String wechatAvatarKey;

    @Column(name = "wechat_avatar_etag", length = 64)
    private String wechatAvatarEtag;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "session_version", length = 64)
    private String sessionVersion;

    @PrePersist
    public void onCreate() {
        if (loginName == null && passwordHash != null) setLoginName(username);
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getLoginName() { return loginName; }

    public void setLoginName(String loginName) {
        this.loginName = loginName;
        this.loginNameKey = loginName == null ? null : loginName.toLowerCase(java.util.Locale.ROOT);
    }

    public boolean hasPasswordLogin() { return loginName != null && passwordHash != null; }

    public String getAvatarSource() { return avatarSource; }
    public void setAvatarSource(String value) { avatarSource = value; }
    public String getWechatAvatarAssetId() { return wechatAvatarAssetId; }
    public void setWechatAvatarAssetId(String value) { wechatAvatarAssetId = value; }
    public String getWechatAvatarKey() { return wechatAvatarKey; }
    public void setWechatAvatarKey(String value) { wechatAvatarKey = value; }
    public String getWechatAvatarEtag() { return wechatAvatarEtag; }
    public void setWechatAvatarEtag(String value) { wechatAvatarEtag = value; }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getAvatarId() {
        return avatarId;
    }

    public void setAvatarId(String avatarId) {
        this.avatarId = avatarId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setLastLoginAt(LocalDateTime lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public String getSessionVersion() {
        return sessionVersion;
    }

    public void setSessionVersion(String sessionVersion) {
        this.sessionVersion = sessionVersion;
    }
}
