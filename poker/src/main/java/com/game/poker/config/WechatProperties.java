package com.game.poker.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app.wechat")
public class WechatProperties {
    private boolean enabled;
    private String appId = "";
    private String appSecret = "";
}
