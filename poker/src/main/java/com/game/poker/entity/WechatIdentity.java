package com.game.poker.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Getter
@NoArgsConstructor
@Entity
@Table(name = "wechat_identity", uniqueConstraints = {
        @UniqueConstraint(name = "uk_wechat_app_openid", columnNames = {"app_id", "openid"}),
        @UniqueConstraint(name = "uk_wechat_user_app", columnNames = {"user_id", "app_id"})})
public class WechatIdentity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false)
    private Long userId;
    @Column(name = "app_id", nullable = false, length = 64)
    private String appId;
    @Column(nullable = false, length = 128)
    private String openid;
    @Column(length = 128)
    private String unionid;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public WechatIdentity(Long userId, String appId, String openid, String unionid) {
        this.userId = userId;
        this.appId = appId;
        this.openid = openid;
        this.unionid = unionid;
        this.createdAt = LocalDateTime.now();
    }
}
