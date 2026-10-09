package com.game.poker.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.auth.AuthException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class AvatarCatalog {
    public record Avatar(String id, String name, String category, String url) {}

    private final List<Avatar> avatars;
    private final Map<String, Avatar> byId;

    public AvatarCatalog() throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        try (var input = new ClassPathResource("avatars/catalog.json").getInputStream()) {
            avatars = List.copyOf(mapper.convertValue(mapper.readTree(input).get("avatars"),
                    new TypeReference<List<Avatar>>() {}));
        }
        byId = avatars.stream().collect(Collectors.toUnmodifiableMap(Avatar::id, Function.identity()));
        if (!byId.containsKey("xiaotao-smile")) throw new IllegalStateException("Missing default avatar");
    }

    public List<Avatar> list() {
        return avatars;
    }

    public Avatar require(String id) {
        Avatar avatar = id == null ? null : byId.get(id);
        if (avatar == null) throw new AuthException(HttpStatus.BAD_REQUEST, "请选择已有头像");
        return avatar;
    }

    public Avatar resolve(String id) {
        return id == null ? byId.get("xiaotao-smile") : byId.getOrDefault(id, byId.get("xiaotao-smile"));
    }
}
