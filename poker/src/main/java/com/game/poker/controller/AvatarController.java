package com.game.poker.controller;

import com.game.poker.service.AuthService;
import com.game.poker.service.AvatarCatalog;
import com.game.poker.service.AvatarService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/avatars")
public class AvatarController {
    public record AvatarRequest(@NotBlank @Size(max = 40) String avatarId) {}

    private final AuthService auth;
    private final AvatarCatalog catalog;
    private final AvatarService avatars;

    public AvatarController(AuthService auth, AvatarCatalog catalog, AvatarService avatars) {
        this.auth = auth;
        this.catalog = catalog;
        this.avatars = avatars;
    }

    @GetMapping
    public List<AvatarCatalog.Avatar> list(HttpServletRequest request, HttpSession session) {
        auth.requireAuthenticatedUser(request, session, false);
        return catalog.list();
    }

    @PostMapping("/me")
    public AvatarCatalog.Avatar update(@Valid @RequestBody AvatarRequest payload,
                                       HttpServletRequest request, HttpSession session) {
        String username = auth.requireAuthenticatedUser(request, session, false).getUsername();
        return avatars.update(username, payload.avatarId());
    }
}
