package com.game.poker.service;

import com.game.poker.auth.AuthException;
import com.game.poker.repository.UserAccountRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class AvatarService {
    public record AvatarChanged(String username, String url) {}

    private final UserAccountRepository accounts;
    private final AvatarCatalog catalog;
    private final ApplicationEventPublisher events;

    public AvatarService(UserAccountRepository accounts, AvatarCatalog catalog, ApplicationEventPublisher events) {
        this.accounts = accounts;
        this.catalog = catalog;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public AvatarCatalog.Avatar getForUser(String username) {
        return accounts.findByUsername(username).map(user -> catalog.resolve(user.getAvatarId())).orElse(null);
    }

    @Transactional
    public AvatarCatalog.Avatar update(String username, String avatarId) {
        AvatarCatalog.Avatar avatar = catalog.require(avatarId);
        if (accounts.updateAvatar(username, avatar.id(), LocalDateTime.now()) != 1) {
            throw new AuthException(HttpStatus.NOT_FOUND, "账号不存在");
        }
        events.publishEvent(new AvatarChanged(username, avatar.url()));
        return avatar;
    }
}
