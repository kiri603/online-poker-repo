package com.game.poker.service;

import com.aliyun.oss.*;
import com.aliyun.oss.common.auth.DefaultCredentialProvider;
import com.aliyun.oss.common.comm.SignVersion;
import com.aliyun.oss.model.*;
import com.game.poker.auth.AuthException;
import com.game.poker.config.AvatarOssProperties;
import jakarta.annotation.PreDestroy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.io.*;

@Component
public class AvatarObjectStorage {
    public static final String PREFIX = "avatars/wechat/";
    private final AvatarOssProperties properties;
    private OSS client;
    public AvatarObjectStorage(AvatarOssProperties properties) { this.properties = properties; }
    public boolean enabled() { return properties.isEnabled(); }
    private synchronized OSS client() {
        if (!enabled()) throw unavailable();
        if (client == null) {
            if (!properties.getEndpoint().startsWith("https://") || properties.getRegion().isBlank()
                    || properties.getBucket().isBlank() || properties.getAccessKeyId().isBlank() || properties.getAccessKeySecret().isBlank()) throw unavailable();
            ClientBuilderConfiguration config = new ClientBuilderConfiguration();
            config.setSignatureVersion(SignVersion.V4); config.setConnectionTimeout(5000); config.setSocketTimeout(5000);
            config.setConnectionRequestTimeout(5000); config.setMaxErrorRetry(1); config.setMaxConnections(32);
            config.setRedirectEnable(false);
            var credentials = new DefaultCredentialProvider(properties.getAccessKeyId(), properties.getAccessKeySecret(),
                    properties.getSecurityToken().isBlank() ? null : properties.getSecurityToken());
            client = OSSClientBuilder.create().endpoint(properties.getEndpoint()).region(properties.getRegion())
                    .credentialsProvider(credentials).clientConfiguration(config).build();
        }
        return client;
    }
    public void put(String key, byte[] jpeg) {
        requireKey(key);
        try {
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentType("image/jpeg"); metadata.setContentLength(jpeg.length);
            metadata.setObjectAcl(CannedAccessControlList.Private);
            client().putObject(properties.getBucket(), key, new ByteArrayInputStream(jpeg), metadata);
        } catch (Exception e) { throw unavailable(); }
    }
    public byte[] get(String key) {
        requireKey(key);
        try (OSSObject object = client().getObject(properties.getBucket(), key);
             InputStream stream = object.getObjectContent()) {
            byte[] bytes = stream.readNBytes(2 * 1024 * 1024 + 1);
            if (bytes.length > 2 * 1024 * 1024) throw unavailable();
            return bytes;
        } catch (Exception e) { throw unavailable(); }
    }
    public void delete(String key) { requireKey(key); client().deleteObject(properties.getBucket(), key); }
    private void requireKey(String key) {
        if (key == null || !key.matches("avatars/wechat/[0-9]+/[a-f0-9-]{36}\\.jpg")) throw unavailable();
    }
    private AuthException unavailable() { return new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "头像存储暂时不可用，请稍后重试"); }
    @PreDestroy public synchronized void close() { if (client != null) { client.shutdown(); client = null; } }
}
