package com.game.poker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.auth.*;
import com.game.poker.entity.UserAccount;
import com.game.poker.repository.UserAccountRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Service
public class WechatProfileService {
    public record Request(String ticket, String rawData, String signature, boolean syncNickname, boolean syncAvatar) {}
    private final WechatAuthService wechat;
    private final AvatarObjectStorage storage;
    private final WechatAvatarDownloader downloader;
    private final UserAccountRepository accounts;
    private final AvatarService avatars;
    private final AuthRateLimitService limits;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final ObjectMapper json = new ObjectMapper();
    public WechatProfileService(WechatAuthService wechat, AvatarObjectStorage storage, WechatAvatarDownloader downloader,
                                UserAccountRepository accounts, AvatarService avatars, AuthRateLimitService limits,
                                ApplicationEventPublisher events, PlatformTransactionManager manager) {
        this.wechat = wechat; this.storage = storage; this.downloader = downloader; this.accounts = accounts;
        this.avatars = avatars; this.limits = limits; this.events = events; this.transaction = new TransactionTemplate(manager);
    }
    public Map<String, Object> sync(Request body, SessionUser principal) {
        limits.assertWechatAllowed("profile", principal.getUsername());
        var proof = wechat.consumeScoped(body.ticket(), WechatTicketStore.Purpose.PROFILE, principal);
        if (!body.syncNickname() && !body.syncAvatar()) throw new AuthException(HttpStatus.BAD_REQUEST, "请至少选择一项资料同步");
        String nickname, url;
        try {
            byte[] expected = MessageDigest.getInstance("SHA-1").digest((body.rawData() + proof.identity().sessionKey()).getBytes(StandardCharsets.UTF_8));
            byte[] actual = HexFormat.of().parseHex(body.signature());
            if (!MessageDigest.isEqual(expected, actual)) throw new AuthException(HttpStatus.FORBIDDEN, "微信资料校验失败，请重新授权");
            var data = json.readTree(body.rawData());
            nickname = data.path("nickName").asText().trim(); url = data.path("avatarUrl").asText();
            if (body.syncNickname() && (nickname.isBlank() || nickname.codePointCount(0, nickname.length()) > 64
                    || nickname.codePoints().anyMatch(Character::isISOControl))) throw new AuthException(HttpStatus.BAD_REQUEST, "昵称需为1到64个字符");
        } catch (AuthException e) { throw e; }
        catch (Exception e) { throw new AuthException(HttpStatus.FORBIDDEN, "微信资料校验失败，请重新授权"); }
        String assetId = body.syncAvatar() ? UUID.randomUUID().toString() : null;
        String key = assetId == null ? null : AvatarObjectStorage.PREFIX + principal.getId() + "/" + assetId + ".jpg";
        byte[] jpeg = body.syncAvatar() ? downloader.download(url) : null;
        var committed = new java.util.concurrent.atomic.AtomicBoolean();
        try {
            if (jpeg != null) storage.put(key, jpeg);
            String etag = jpeg == null ? null : HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(jpeg));
            return transaction.execute(status -> {
                UserAccount user = accounts.findLockedById(principal.getId()).orElseThrow(() -> new AuthException(HttpStatus.UNAUTHORIZED, "账号不存在"));
                if (!"ACTIVE".equals(user.getStatus()) || !Objects.equals(user.getSessionVersion(), principal.getSessionVersion())) {
                    throw new AuthException(HttpStatus.UNAUTHORIZED, "登录状态已变化，请重新获取微信凭证");
                }
                if (body.syncNickname()) user.setNickname(nickname);
                if (assetId != null) {
                    user.setAvatarSource("WECHAT"); user.setWechatAvatarAssetId(assetId);
                    user.setWechatAvatarKey(key); user.setWechatAvatarEtag(etag);
                }
                accounts.saveAndFlush(user);
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                        new org.springframework.transaction.support.TransactionSynchronization() {
                            @Override public void afterCommit() { committed.set(true); }
                        });
                String avatar = avatars.resolve(user).url();
                events.publishEvent(new AvatarService.AvatarChanged(user.getUsername(), avatar, user.getNickname()));
                return Map.of("username", user.getUsername(), "nickname", user.getNickname(), "avatar", avatar,
                        "avatarSource", user.getAvatarSource());
            });
        } catch (Exception e) {
            if (key != null && !committed.get()) {
                try { storage.delete(key); } catch (Exception ignored) {
                    org.slf4j.LoggerFactory.getLogger(WechatProfileService.class).warn("Unreferenced avatar cleanup failed: {}", key);
                }
            }
            if (e instanceof AuthException auth) throw auth;
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, committed.get()
                    ? "资料已保存，刷新显示失败，请刷新个人详情" : "资料保存失败，原资料已保留，请稍后重试");
        }
    }
}
