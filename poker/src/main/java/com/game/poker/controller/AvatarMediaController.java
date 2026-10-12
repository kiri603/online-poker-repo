package com.game.poker.controller;

import com.game.poker.auth.AuthException;
import com.game.poker.repository.UserAccountRepository;
import com.game.poker.service.AvatarObjectStorage;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/media/avatars")
public class AvatarMediaController {
    private final UserAccountRepository accounts;
    private final AvatarObjectStorage storage;
    public AvatarMediaController(UserAccountRepository accounts, AvatarObjectStorage storage) { this.accounts = accounts; this.storage = storage; }
    // Only published avatar UUIDs can be read. Bucket keys and arbitrary objects are never accepted.
    @GetMapping("/{assetId}") public ResponseEntity<byte[]> read(@PathVariable String assetId,
                    @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {
        if (!assetId.matches("[a-f0-9-]{36}")) throw new AuthException(HttpStatus.NOT_FOUND, "头像不存在");
        var user = accounts.findByWechatAvatarAssetId(assetId).orElseThrow(() -> new AuthException(HttpStatus.NOT_FOUND, "头像不存在"));
        String etag = "\"" + user.getWechatAvatarEtag() + "\"";
        if (etag.equals(ifNoneMatch)) return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag)
                .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic()).build();
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).eTag(etag)
                .header("X-Content-Type-Options", "nosniff").cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic())
                .body(storage.get(user.getWechatAvatarKey()));
    }
}
