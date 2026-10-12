package com.game.poker.service;

import com.game.poker.auth.*;
import com.game.poker.config.WechatProperties;
import com.game.poker.dto.auth.*;
import com.game.poker.entity.*;
import com.game.poker.repository.*;
import jakarta.servlet.http.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.game.poker.service.WechatTicketStore.Purpose;

@Service
public class WechatAuthService {
    private final WechatProperties properties;
    private final WechatClient client;
    private final WechatTicketStore tickets;
    private final WechatIdentityRepository identities;
    private final UserAccountRepository accounts;
    private final UserService users;
    private final AuthService auth;
    private final AuthRateLimitService limits;
    private final PasswordEncoder passwords;

    public WechatAuthService(WechatProperties properties, WechatClient client, WechatTicketStore tickets,
                             WechatIdentityRepository identities, UserAccountRepository accounts, UserService users,
                             AuthService auth, AuthRateLimitService limits, PasswordEncoder passwords) {
        this.properties = properties; this.client = client; this.tickets = tickets; this.identities = identities;
        this.accounts = accounts; this.users = users; this.auth = auth; this.limits = limits; this.passwords = passwords;
    }
    public boolean enabled() { return properties.isEnabled(); }
    public void requireEnabled() {
        if (!enabled()) throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "微信登录尚未启用");
    }
    public Map<String, Object> exchange(String code, Purpose purpose, HttpServletRequest request, HttpSession session) {
        requireEnabled();
        limits.assertWechatAllowed("exchange", request.getRemoteAddr());
        SessionUser principal = purpose == Purpose.AUTH ? null : auth.requireAuthenticatedUser(request, session, false);
        var identity = client.exchange(code);
        var binding = identities.findByAppIdAndOpenid(identity.appId(), identity.openid());
        if (principal != null && (binding.isEmpty() || !binding.get().getUserId().equals(principal.getId()))) {
            throw new AuthException(HttpStatus.FORBIDDEN, "该微信身份未绑定当前账号");
        }
        return Map.of("ticket", tickets.issue(identity, purpose, principal == null ? null : principal.getId(),
                principal == null ? null : principal.getSessionVersion()), "bound", binding.isPresent(), "expiresIn", 300);
    }
    @Transactional
    public AuthUserResponse login(String ticket, HttpSession session, HttpServletRequest request, HttpServletResponse response) {
        var identity = consume(ticket, Purpose.AUTH).identity();
        var binding = identities.findByAppIdAndOpenid(identity.appId(), identity.openid()).orElseThrow(() ->
                new AuthException(HttpStatus.CONFLICT, "请先选择绑定已有账号或创建新账号"));
        return finish(users.lockAccount(binding.getUserId()), session, request, response);
    }
    @Transactional
    public AuthUserResponse register(String ticket, HttpSession session, HttpServletRequest request, HttpServletResponse response) {
        var identity = consume(ticket, Purpose.AUTH).identity();
        limits.assertWechatAllowed("register", request.getRemoteAddr());
        limits.assertWechatAllowed("register", identity.appId() + ":" + identity.openid());
        if (identities.findByAppIdAndOpenid(identity.appId(), identity.openid()).isPresent()) throw conflict();
        String playerId = "wx_" + UUID.randomUUID().toString().replace("-", "").substring(0, 17);
        UserAccount user = users.createUser(playerId, null);
        user.setNickname("新晋将领");
        identities.saveAndFlush(new WechatIdentity(user.getId(), identity.appId(), identity.openid(), identity.unionid()));
        return finish(user, session, request, response);
    }
    @Transactional
    public AuthUserResponse bind(String ticket, AuthRequest credentials, HttpSession session,
                                  HttpServletRequest request, HttpServletResponse response) {
        var identity = consume(ticket, Purpose.AUTH).identity();
        SessionUser current = auth.currentFormalUserIfPresent(request, session);
        UserAccount target = auth.verifyPassword(credentials, session, request.getRemoteAddr(), request.getHeader("User-Agent"));
        if (current != null && !current.getId().equals(target.getId())) {
            throw new AuthException(HttpStatus.FORBIDDEN, "只能绑定当前登录的账号");
        }
        if (current != null && !Objects.equals(current.getSessionVersion(), target.getSessionVersion())) throw stale();
        if (identities.existsByUserIdAndAppId(target.getId(), identity.appId())
                || identities.findByAppIdAndOpenid(identity.appId(), identity.openid()).isPresent()) throw conflict();
        identities.saveAndFlush(new WechatIdentity(target.getId(), identity.appId(), identity.openid(), identity.unionid()));
        return finish(target, session, request, response);
    }
    @Transactional
    public AuthUserResponse credentials(String ticket, String loginName, String password, HttpSession session, HttpServletRequest request) {
        var principal = auth.requireAuthenticatedUser(request, session, false);
        consumeScoped(ticket, Purpose.CREDENTIALS, principal);
        var account = users.lockAccount(principal.getId());
        if (!Objects.equals(account.getSessionVersion(), principal.getSessionVersion())) throw stale();
        if (account.hasPasswordLogin()) throw new AuthException(HttpStatus.CONFLICT, "账号已开通密码登录");
        loginName = loginName.trim();
        auth.validateUsername(loginName); auth.validatePassword(password);
        if (users.existsByLoginName(loginName) || users.existsByUsername(loginName)) throw new AuthException(HttpStatus.CONFLICT, "登录名已存在");
        account.setLoginName(loginName); account.setPasswordHash(passwords.encode(password));
        accounts.saveAndFlush(account);
        return auth.describe(account, null);
    }
    public WechatTicketStore.Ticket consumeScoped(String value, Purpose purpose, SessionUser principal) {
        var ticket = consume(value, purpose);
        if (!Objects.equals(ticket.userId(), principal.getId()) || !Objects.equals(ticket.sessionVersion(), principal.getSessionVersion())) throw stale();
        var identity = ticket.identity();
        if (!identities.findByAppIdAndOpenid(identity.appId(), identity.openid()).map(binding -> binding.getUserId().equals(principal.getId())).orElse(false)) {
            throw new AuthException(HttpStatus.FORBIDDEN, "微信身份与当前账号不匹配");
        }
        return ticket;
    }
    private WechatTicketStore.Ticket consume(String value, Purpose purpose) {
        requireEnabled(); return tickets.consume(value, purpose);
    }
    private AuthUserResponse finish(UserAccount user, HttpSession session, HttpServletRequest request, HttpServletResponse response) {
        return auth.finishAuthenticatedLogin(user, session, request, response, request.getRemoteAddr(), request.getHeader("User-Agent"));
    }
    private AuthException conflict() { return new AuthException(HttpStatus.CONFLICT, "微信或游戏账号已经绑定，不能覆盖，请重新登录"); }
    private AuthException stale() { return new AuthException(HttpStatus.UNAUTHORIZED, "微信证明与当前登录状态不匹配，请重新获取"); }
}
