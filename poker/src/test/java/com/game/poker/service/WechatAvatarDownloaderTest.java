package com.game.poker.service;

import com.game.poker.auth.AuthException;
import org.junit.jupiter.api.Test;
import java.net.InetAddress;
import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.ImageIO;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WechatAvatarDownloaderTest {
    WechatAvatarDownloader downloader = new WechatAvatarDownloader();
    @Test void blocksInternalAddressesAndUntrustedUris() throws Exception {
        for (String value : new String[]{"http://thirdwx.qlogo.cn/a", "https://qlogo.cn.evil.test/a", "https://127.0.0.1/a", "https://user@qlogo.cn/a", "https://qlogo.cn:444/a"}) {
            assertThrows(AuthException.class, () -> downloader.requireAllowedUri(value));
        }
        for (String ip : new String[]{"127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fc00::1"})
            assertThat(WechatAvatarDownloader.isPublicAddress(InetAddress.getByName(ip))).isFalse();
        assertThat(WechatAvatarDownloader.isPublicAddress(InetAddress.getByName("8.8.8.8"))).isTrue();
    }
    @Test void normalizesImagesAndRejectsOversizedDimensionsAndInvalidBytes() throws Exception {
        var out = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(100, 50, BufferedImage.TYPE_INT_ARGB), "png", out);
        var jpeg = downloader.reencode(out.toByteArray());
        var decoded = ImageIO.read(new ByteArrayInputStream(jpeg));
        assertThat(decoded.getWidth()).isEqualTo(256); assertThat(decoded.getHeight()).isEqualTo(256);
        assertThrows(AuthException.class, () -> downloader.reencode(new byte[]{1, 2, 3}));
        out.reset(); ImageIO.write(new BufferedImage(2049, 1, BufferedImage.TYPE_INT_RGB), "png", out);
        byte[] oversized = out.toByteArray();
        assertThrows(AuthException.class, () -> downloader.reencode(oversized));
    }
}
