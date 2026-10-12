package com.game.poker.controller;

import com.game.poker.service.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/wechat")
public class WechatProfileController {
    public record Profile(@NotBlank @Size(max=64) String ticket, @NotBlank @Size(max=8192) String rawData,
                          @NotBlank @Pattern(regexp="[a-fA-F0-9]{40}") String signature,
                          boolean syncNickname, boolean syncAvatar) {}
    private final AuthService auth;
    private final WechatProfileService profiles;
    public WechatProfileController(AuthService auth, WechatProfileService profiles) { this.auth = auth; this.profiles = profiles; }
    @PostMapping("/profile") public Map<String, Object> profile(@Valid @RequestBody Profile body, HttpServletRequest request, HttpSession session) {
        return profiles.sync(new WechatProfileService.Request(body.ticket(), body.rawData(), body.signature(), body.syncNickname(), body.syncAvatar()),
                auth.requireAuthenticatedUser(request, session, false));
    }
}
