package com.game.poker.service;

import com.game.poker.entity.UserAccount;
import com.game.poker.auth.AuthException;
import com.game.poker.auth.AuthSessionKeys;
import com.game.poker.auth.SessionUser;
import com.game.poker.controller.AvatarController;
import com.game.poker.repository.UserAccountRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
class AvatarSystemIntegrationTest {
    @Autowired private UserAccountRepository accounts;
    @Autowired private SocialService social;
    @Autowired private AvatarService avatars;
    @Autowired private AvatarController controller;
    @Autowired private AvatarCatalog catalog;
    @Autowired private GameService games;

    private UserAccount createAccount() {
        UserAccount user = new UserAccount();
        user.setUsername("av" + System.nanoTime());
        user.setNickname(user.getUsername());
        user.setPasswordHash("test-hash");
        user.setStatus("ACTIVE");
        user.setSessionVersion("avatar-test-version");
        return accounts.saveAndFlush(user);
    }

    @Test
    void existingAccountWithoutSelectionHasDefaultAvatar() {
        UserAccount user = createAccount();
        var profile = social.getProfile(user.getUsername());
        assertThat(profile.get("avatarId")).isEqualTo("xiaotao-smile");
        assertThat(profile.get("avatar")).isEqualTo("/images/emojis/01_xiao.png");
    }

    @Test
    void selectingAvatarPersistsAndIsReturnedInFreshProfileAndOverview() {
        UserAccount user = createAccount();
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(AuthSessionKeys.LOGIN_USER, SessionUser.from(user));
        var response = controller.update(new AvatarController.AvatarRequest("hoodie-girl-smug"),
                new MockHttpServletRequest(), session);
        assertThat(response.url()).isEqualTo("/images/avatars/hoodie-girl-smug.png");
        UserAccount reloaded = accounts.findById(user.getId()).orElseThrow();
        assertThat(reloaded.getAvatarId()).isEqualTo("hoodie-girl-smug");
        assertThat(reloaded.getSessionVersion()).isEqualTo(user.getSessionVersion());
        assertThat(reloaded.getPasswordHash()).isEqualTo(user.getPasswordHash());
        assertThat(social.getProfile(user.getUsername()).get("avatarId")).isEqualTo("hoodie-girl-smug");
        assertThat(social.getOverview(user.getUsername()).get("avatar")).isEqualTo(response.url());
    }

    @Test
    void unknownRemovedAndExternalAvatarsCannotBeSaved() {
        UserAccount user = createAccount();
        for (String id : new String[]{"cat-orange", "dog-corgi", "../etc/passwd", "https://example.com/a.png", "", "missing"}) {
            assertThat(assertThrows(AuthException.class, () -> avatars.update(user.getUsername(), id)).getStatus())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }
        assertThat(accounts.findById(user.getId()).orElseThrow().getAvatarId()).isNull();
        assertThat(catalog.list()).hasSize(15);
        assertThat(catalog.require("kunkun").name()).isEqualTo("坤坤");
        assertThat(catalog.require("nailong").name()).isEqualTo("奶龙");
        assertThat(catalog.require("nailong").url()).isEqualTo("/images/avatars/nailong.png");
        assertThat(catalog.require("naiwa").name()).isEqualTo("奶娃");
        assertThat(catalog.require("naiwa").url()).isEqualTo("/images/avatars/naiwa.png");
    }

    @Test
    void guestsAndUnauthenticatedUsersCannotSelectOrListAvatars() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpSession session = new MockHttpSession();
        assertThat(assertThrows(AuthException.class, () -> controller.list(request, session)).getStatus())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        session.setAttribute(AuthSessionKeys.LOGIN_USER, SessionUser.guest("guest-avatar-test"));
        assertThat(assertThrows(AuthException.class, () -> controller.update(
                new AvatarController.AvatarRequest("general"), request, session)).getStatus())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(assertThrows(AuthException.class, () -> controller.list(request, session)).getStatus())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void savingAvatarUpdatesExistingRoomSeatAfterCommit() {
        UserAccount user = createAccount();
        var room = games.joinRoom("avatar" + System.nanoTime(), user.getUsername(), false, "");
        avatars.update(user.getUsername(), "alan-walker-smug");
        assertThat(room.getPlayers().getFirst().getAvatar()).isEqualTo("/images/avatars/alan-walker-smug.png");
        avatars.update(user.getUsername(), "general");
        assertThat(room.getPlayers().getFirst().getAvatar()).isEqualTo("/images/avatars/general.png");
        assertThat(room.isStarted()).isFalse();
    }
}
