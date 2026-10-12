package com.game.poker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.auth.AuthException;
import com.game.poker.config.WechatProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
public class WechatClient {
    // Identity values and sessionKey are server-only; never return this record from a controller.
    public record Identity(String appId, String openid, String unionid, String sessionKey) {}
    private final WechatProperties properties;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    public WechatClient(WechatProperties properties) { this.properties = properties; }

    public Identity exchange(String code) {
        if (!properties.isEnabled() || properties.getAppId().isBlank() || properties.getAppSecret().isBlank()) {
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "微信登录尚未启用");
        }
        try {
            String query = "appid=" + encode(properties.getAppId()) + "&secret=" + encode(properties.getAppSecret())
                    + "&js_code=" + encode(code) + "&grant_type=authorization_code";
            var request = HttpRequest.newBuilder(URI.create("https://api.weixin.qq.com/sns/jscode2session?" + query))
                    .timeout(Duration.ofSeconds(8)).GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200 || response.body().length() > 16384) throw new IllegalStateException();
            var data = json.readTree(response.body());
            if (data.path("errcode").asInt() != 0 || !data.hasNonNull("openid") || !data.hasNonNull("session_key")) {
                throw new AuthException(HttpStatus.UNAUTHORIZED, "微信凭证无效，请重新点击微信登录");
            }
            String openid = data.path("openid").asText();
            String key = data.path("session_key").asText();
            if (openid.isBlank() || openid.length() > 128 || key.isBlank() || key.length() > 128) throw new IllegalStateException();
            String unionid = data.hasNonNull("unionid") ? data.path("unionid").asText() : null;
            if (unionid != null && unionid.length() > 128) throw new IllegalStateException();
            return new Identity(properties.getAppId(), openid, unionid, key);
        } catch (AuthException e) { throw e; }
        catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "微信服务暂时不可用，请稍后重试");
        } catch (Exception e) {
            // Do not log request URIs or upstream responses containing AppSecret/session_key.
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "微信服务暂时不可用，请稍后重试");
        }
    }
    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
