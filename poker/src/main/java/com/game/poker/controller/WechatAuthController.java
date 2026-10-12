package com.game.poker.controller;

import com.game.poker.dto.auth.*;
import com.game.poker.service.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class WechatAuthController {
    public record Exchange(@NotBlank @Size(max=512) String code, @NotNull WechatTicketStore.Purpose purpose) {}
    public record Ticket(@NotBlank @Size(max=64) String ticket) {}
    public record Bind(@NotBlank @Size(max=64) String ticket, @NotBlank @Size(max=20) String loginName,
                       @NotBlank @Size(max=64) String password, @NotBlank @Size(max=8) String captchaCode) {}
    public record Credentials(@NotBlank @Size(max=64) String ticket, @NotBlank @Size(max=20) String loginName,
                              @NotBlank @Size(max=64) String password) {}
    private final WechatAuthService wechat;
    private final AvatarObjectStorage storage;
    public WechatAuthController(WechatAuthService wechat, AvatarObjectStorage storage) { this.wechat = wechat; this.storage = storage; }
    @GetMapping("/wechat/config") public Map<String, Boolean> config() { return Map.of("enabled", wechat.enabled(), "avatarEnabled", storage.enabled()); }
    @PostMapping("/wechat/exchange") public Map<String, Object> exchange(@Valid @RequestBody Exchange body, HttpServletRequest request, HttpSession session) {
        return wechat.exchange(body.code(), body.purpose(), request, session);
    }
    @PostMapping("/wechat/login") public AuthUserResponse login(@Valid @RequestBody Ticket body, HttpSession session, HttpServletRequest request, HttpServletResponse response) {
        return wechat.login(body.ticket(), session, request, response);
    }
    @PostMapping("/wechat/register") public AuthUserResponse register(@Valid @RequestBody Ticket body, HttpSession session, HttpServletRequest request, HttpServletResponse response) {
        return wechat.register(body.ticket(), session, request, response);
    }
    @PostMapping("/wechat/bind") public AuthUserResponse bind(@Valid @RequestBody Bind body, HttpSession session, HttpServletRequest request, HttpServletResponse response) {
        AuthRequest credentials = new AuthRequest();
        credentials.setUsername(body.loginName()); credentials.setPassword(body.password()); credentials.setCaptchaCode(body.captchaCode());
        return wechat.bind(body.ticket(), credentials, session, request, response);
    }
    @PostMapping("/credentials") public AuthUserResponse credentials(@Valid @RequestBody Credentials body, HttpSession session, HttpServletRequest request) {
        return wechat.credentials(body.ticket(), body.loginName(), body.password(), session, request);
    }
}
