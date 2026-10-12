package com.game.poker.service;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest(properties = {"app.wechat.enabled=true", "app.wechat.app-id=wx-profile"})
class WechatProfileIntegrationTest {
    @Autowired WebApplicationContext context;
    @Autowired UserService users;
    @MockitoBean WechatClient client;
    @MockitoBean AvatarObjectStorage storage;
    @MockitoBean WechatAvatarDownloader downloader;
    MockMvc mvc; ObjectMapper json = new ObjectMapper();
    MockHttpSession session; String openid; JsonNode account;
    byte[] jpeg = new byte[]{(byte)255, (byte)216, (byte)255, (byte)217};
    @BeforeEach void setup() throws Exception {
        mvc = MockMvcBuilders.webAppContextSetup(context).build(); session = new MockHttpSession(); openid = "p" + System.nanoTime();
        when(client.exchange(anyString())).thenAnswer(i -> new WechatClient.Identity("wx-profile", i.getArgument(0), null, "key"));
        when(storage.enabled()).thenReturn(true); when(storage.get(anyString())).thenReturn(jpeg);
        when(downloader.download(anyString())).thenReturn(jpeg);
        account = call("/wechat/register", Map.of("ticket", ticket("AUTH")), 200);
    }
    JsonNode call(String path, Map<String, ?> body, int status) throws Exception {
        var response = mvc.perform(post("/api/auth" + path).session(session).contentType("application/json").content(json.writeValueAsBytes(body))).andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString()).isEqualTo(status);
        return json.readTree(response.getContentAsString());
    }
    String ticket(String purpose) throws Exception { return call("/wechat/exchange", Map.of("code", openid, "purpose", purpose), 200).path("ticket").asText(); }
    Map<String, Object> profile(String nickname, boolean avatar) throws Exception {
        String raw = json.writeValueAsString(Map.of("nickName", nickname, "avatarUrl", "https://thirdwx.qlogo.cn/avatar/0"));
        String signature = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest((raw + "key").getBytes(StandardCharsets.UTF_8)));
        return new HashMap<>(Map.of("ticket", ticket("PROFILE"), "rawData", raw, "signature", signature, "syncNickname", true, "syncAvatar", avatar));
    }
    @Test void invalidSignatureDoesNotDownloadOrChangeProfile() throws Exception {
        var body = profile("伪造昵称", true); body.put("signature", "0".repeat(40));
        call("/wechat/profile", body, 403);
        verifyNoInteractions(downloader);
        assertThat(users.findById(account.path("id").asLong()).orElseThrow().getNickname()).isEqualTo("新晋将领");
    }
    @Test void nicknameCanSyncWithoutAvatarAndWithoutReplacingLoginState() throws Exception {
        String nickname = "将军😀".repeat(10);
        var result = call("/wechat/profile", profile(nickname, false), 200);
        assertThat(result.path("nickname").asText()).isEqualTo(nickname);
        assertThat(result.path("username")).isEqualTo(account.path("username"));
        verifyNoInteractions(downloader);
        mvc.perform(get("/api/auth/me").header("X-Poker-Auth-Token", account.path("tabToken").asText()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
    }
    @Test void storageFailureLeavesBothOriginalNicknameAndAvatar() throws Exception {
        doThrow(new com.game.poker.auth.AuthException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "存储失败"))
                .when(storage).put(anyString(), any());
        call("/wechat/profile", profile("不应保存", true), 503);
        var user = users.findById(account.path("id").asLong()).orElseThrow();
        assertThat(user.getNickname()).isEqualTo("新晋将领");
        assertThat(user.getWechatAvatarAssetId()).isNull();
        verify(storage).delete(anyString());
    }
    @Test void publishedAvatarIsStableCacheableAndCanSwitchBackToCatalog() throws Exception {
        var result = call("/wechat/profile", profile("主公", true), 200);
        String avatar = result.path("avatar").asText();
        assertThat(avatar).startsWith("/api/media/avatars/");
        var media = mvc.perform(get(avatar)).andReturn().getResponse();
        assertThat(media.getStatus()).isEqualTo(200);
        assertThat(media.getContentAsByteArray()).isEqualTo(jpeg);
        assertThat(media.getHeader("ETag")).isNotBlank();
        mvc.perform(get(avatar).header("If-None-Match", media.getHeader("ETag")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotModified());
        mvc.perform(post("/api/avatars/me").session(session).contentType("application/json").content("{\"avatarId\":\"xiaotao-smile\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        assertThat(users.findById(account.path("id").asLong()).orElseThrow().getAvatarSource()).isEqualTo("CATALOG");
    }
    @Test void anotherWechatIdentityCannotAcquireProfileProof() throws Exception {
        call("/wechat/exchange", Map.of("code", "other" + openid, "purpose", "PROFILE"), 403);
        verifyNoInteractions(downloader);
    }
}
