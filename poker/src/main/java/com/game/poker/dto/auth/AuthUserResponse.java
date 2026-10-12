package com.game.poker.dto.auth;

import com.game.poker.auth.SessionUser;
import com.game.poker.entity.UserAccount;

public class AuthUserResponse {
    private Long id;
    private String username;
    private String nickname;
    private boolean guest;
    private String tabToken;
    private boolean dailySignInAvailable;
    private String loginName;
    private boolean passwordLoginEnabled;
    private boolean wechatBound;

    public AuthUserResponse() {
    }

    public AuthUserResponse(Long id, String username, String nickname, boolean guest, String tabToken, boolean dailySignInAvailable) {
        this.id = id;
        this.username = username;
        this.nickname = nickname;
        this.guest = guest;
        this.tabToken = tabToken;
        this.dailySignInAvailable = dailySignInAvailable;
    }

    public static AuthUserResponse from(UserAccount user, String tabToken, boolean dailySignInAvailable) {
        AuthUserResponse response = new AuthUserResponse(user.getId(), user.getUsername(), user.getNickname(), false, tabToken, dailySignInAvailable);
        response.loginName = user.getLoginName();
        response.passwordLoginEnabled = user.hasPasswordLogin();
        return response;
    }

    public static AuthUserResponse from(SessionUser user, String tabToken, boolean dailySignInAvailable) {
        return new AuthUserResponse(user.getId(), user.getUsername(), user.getNickname(), user.isGuest(), tabToken, dailySignInAvailable);
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getNickname() {
        return nickname;
    }

    public boolean isGuest() {
        return guest;
    }

    public String getTabToken() {
        return tabToken;
    }

    public boolean isDailySignInAvailable() {
        return dailySignInAvailable;
    }

    public String getLoginName() { return loginName; }
    public boolean isPasswordLoginEnabled() { return passwordLoginEnabled; }
    public boolean isWechatBound() { return wechatBound; }
    public AuthUserResponse withWechatBound(boolean bound) { wechatBound = bound; return this; }
    public void setTabToken(String token) { tabToken = token; }
}
