package com.game.poker.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data @Component @ConfigurationProperties(prefix = "app.avatar-oss")
public class AvatarOssProperties {
    private boolean enabled;
    private String endpoint = "";
    private String region = "";
    private String bucket = "";
    private String accessKeyId = "";
    private String accessKeySecret = "";
    private String securityToken = "";
}
