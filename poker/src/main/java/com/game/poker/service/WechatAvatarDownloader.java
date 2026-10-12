package com.game.poker.service;

import com.game.poker.auth.AuthException;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.HttpClients;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.net.*;
import java.util.Locale;

@Component
public class WechatAvatarDownloader {
    private static final int LIMIT = 2 * 1024 * 1024;
    public byte[] download(String value) {
        URI uri = requireAllowedUri(value);
        RequestConfig config = RequestConfig.custom().setConnectTimeout(3000).setSocketTimeout(3000)
                .setConnectionRequestTimeout(3000).setRedirectsEnabled(false).build();
        // Resolve once for the connection, preserving TLS hostname verification and blocking DNS rebinding.
        try (var client = HttpClients.custom().disableRedirectHandling().disableAutomaticRetries()
                .setDefaultRequestConfig(config).setDnsResolver(host -> {
                    InetAddress[] addresses = InetAddress.getAllByName(host);
                    for (var address : addresses) if (!isPublicAddress(address)) throw new UnknownHostException("Blocked avatar address");
                    return addresses;
                }).build(); var response = client.execute(new HttpGet(uri))) {
            if (response.getStatusLine().getStatusCode() != 200 || response.getEntity() == null
                    || response.getEntity().getContentLength() > LIMIT) throw invalid();
            try (var stream = response.getEntity().getContent(); var out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                long deadline = System.nanoTime() + 8_000_000_000L;
                while ((count = stream.read(buffer)) != -1) {
                    if (System.nanoTime() > deadline || out.size() + count > LIMIT) throw invalid();
                    out.write(buffer, 0, count);
                }
                return reencode(out.toByteArray());
            }
        } catch (AuthException e) { throw e; }
        catch (Exception e) { throw new AuthException(HttpStatus.BAD_GATEWAY, "微信头像下载失败，请重新授权或稍后重试"); }
    }
    public URI requireAllowedUri(String value) {
        try {
            URI uri = URI.create(value);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getFragment() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)
                    || !(host.equals("qlogo.cn") || host.endsWith(".qlogo.cn"))) throw invalid();
            return uri;
        } catch (IllegalArgumentException e) { throw invalid(); }
    }
    public static boolean isPublicAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] a = address.getAddress();
        if (a.length == 16) return (a[0] & 0xe0) == 0x20; // Only global unicast IPv6 2000::/3.
        int first = a[0] & 255, second = a[1] & 255, third = a[2] & 255;
        return first != 0 && first != 10 && first != 127 && first < 224
                && !(first == 100 && second >= 64 && second <= 127)
                && !(first == 169 && second == 254) && !(first == 172 && second >= 16 && second <= 31)
                && !(first == 192 && (second == 168 || (second == 0 && (third == 0 || third == 2))))
                && !(first == 198 && (second == 18 || second == 19 || (second == 51 && third == 100)))
                && !(first == 203 && second == 0 && third == 113);
    }
    public byte[] reencode(byte[] data) {
        if (data.length > LIMIT) throw invalid();
        try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw invalid();
            var reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 2048 || height > 2048) throw invalid();
                BufferedImage source = reader.read(0);
                BufferedImage target = new BufferedImage(256, 256, BufferedImage.TYPE_INT_RGB);
                Graphics2D graphics = target.createGraphics();
                try {
                    graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, 256, 256);
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    int edge = Math.min(width, height), x = (width-edge)/2, y = (height-edge)/2;
                    graphics.drawImage(source, 0, 0, 256, 256, x, y, x+edge, y+edge, null);
                } finally { graphics.dispose(); }
                var output = new ByteArrayOutputStream(); ImageIO.write(target, "jpeg", output); return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (AuthException e) { throw e; }
        catch (Exception e) { throw invalid(); }
    }
    private AuthException invalid() { return new AuthException(HttpStatus.BAD_REQUEST, "微信头像地址或图片不合法"); }
}
