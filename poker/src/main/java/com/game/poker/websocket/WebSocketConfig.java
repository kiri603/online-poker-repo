package com.game.poker.websocket;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Autowired
    private GameWebSocketHandler gameWebSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 配置 WebSocket 的连接端点为 /ws/game
        // 允许跨域请求 (setAllowedOrigins("*"))，方便本地 Vue 项目调试
        registry.addHandler(gameWebSocketHandler, "/ws/game").setAllowedOrigins("*");
    }
}