package com.game.poker.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.game.poker.model.Card;
import com.game.poker.model.GameMessage;
import com.game.poker.model.GameRoom;
import com.game.poker.service.GameService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Slf4j
@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    @Autowired
    private GameService gameService;

    // JSON 转换工具
    private final ObjectMapper objectMapper = new ObjectMapper();

    // 记录 房间ID -> 该房间内所有的 WebSocketSession
    private final Map<String, CopyOnWriteArraySet<WebSocketSession>> roomSessions = new ConcurrentHashMap<>();
    // 记录 SessionID -> 用户ID (用于断开连接时清理)
    private final Map<String, String> sessionUserMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("新的 WebSocket 连接建立: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        GameMessage gameMsg;
        try {
            gameMsg = objectMapper.readValue(payload, GameMessage.class);
        } catch (Exception e) {
            log.warn("收到非法 JSON 数据，解析失败。内容: {}", payload);
            // 主动向客户端发送错误提示
            if (session.isOpen()) {
                session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"指令发送失败：JSON 格式不正确，请检查是否有多余的逗号或缺少的括号。\"}"));
            }
            // 直接 return 结束本次处理。由于异常被捕获且没有向外抛出，WebSocket 连接将保持畅通
            return;
        }
        String roomId = gameMsg.getRoomId();
        String userId = gameMsg.getUserId();
        String type = gameMsg.getType();

        sessionUserMap.put(session.getId(), userId);

        try {
            switch (type) {
                case "JOIN_ROOM": {
                    // 解析 payload 为 Map
                    Map<String, Object> data = null;
                    if (gameMsg.getData() instanceof Map) {
                        data = (Map<String, Object>) gameMsg.getData();
                    }

                    // ====== 【核心修复】：使用 Map 标准方法提取参数，安全转换类型 ======
                    boolean isCreating = data != null && Boolean.TRUE.equals(data.get("isCreating"));
                    boolean isPrivate = data != null && Boolean.TRUE.equals(data.get("isPrivate"));
                    String password = (data != null && data.get("password") != null) ? String.valueOf(data.get("password")) : "";

                    com.game.poker.model.GameRoom currentRoom = gameService.getRoomMap().get(roomId);

                    // ====== 严格区分创建与加入逻辑 ======
                    if (isCreating) {
                        // 1. 如果尝试创建，但房间已被别人抢先创建，报错拦截
                        if (currentRoom != null) {
                            session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"该房间已被他人创建\"}"));
                            return;
                        }
                        // 2. 正常创建房间并应用前端传来的高级设置
                        currentRoom = new com.game.poker.model.GameRoom(roomId);
                        currentRoom.setOwnerId(userId);
                        currentRoom.setPrivateRoom(isPrivate);
                        currentRoom.setPassword(password);

                        // ====== 【核心修复】：处理嵌套的 settings Map ======
                        if (data != null && data.containsKey("settings") && data.get("settings") instanceof Map) {
                            Map<String, Object> settings = (Map<String, Object>) data.get("settings");

                            if (settings.containsKey("enableScrollCards")) {
                                currentRoom.getSettings().put("enableScrollCards", Boolean.TRUE.equals(settings.get("enableScrollCards")));
                            }
                            if (settings.containsKey("enableWildcard")) {
                                currentRoom.getSettings().put("enableWildcard", Boolean.TRUE.equals(settings.get("enableWildcard")));
                            }
                            if (settings.containsKey("enableSkills")) {
                                currentRoom.getSettings().put("enableSkills", Boolean.TRUE.equals(settings.get("enableSkills")));
                            }
                        }
                        gameService.getRoomMap().put(roomId, currentRoom);
                    } else {
                        // 1. 如果是加入已有房间，但房间不存在
                        if (currentRoom == null) {
                            session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"房间不存在，请返回大厅重新创建\"}"));
                            return;
                        }
                        // 2. 校验私密房间密码
                        if (currentRoom.isPrivateRoom()) {
                            if (!currentRoom.getPassword().equals(password)) {
                                session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"密码错误\"}"));
                                return;
                            }
                        }
                    }

                    // ====== 正常执行加入与广播 ======
                    try {
                        // 此时房间必定已经存在（要么刚创建，要么已校验），正常执行加入
                        gameService.joinRoom(roomId, userId, isPrivate, password);

                        addSessionToRoom(roomId, session);
                        broadcastToRoom(roomId, new TextMessage("{\"event\": \"USER_JOINED\", \"userId\": \"" + userId + "\"}"));
                        broadcastGameState(roomId);
                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                        try {
                            session.close();
                        } catch (java.io.IOException ignored) {}
                    }

                    break;
                }

                case "START_GAME":
                    try {
                        gameService.startGame(roomId, userId);
                        GameRoom room = gameService.getRoom(roomId);

                        // ====== 【核心修复】：分流下发指令 ======
                        if (Boolean.TRUE.equals(room.getSettings().get("enableSkills"))) {
                            // 技能模式：只发选将指令！此时绝对不能发 GAME_STARTED 和空手牌！
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"START_SKILL_SELECTION\"}"));
                        } else {
                            // 经典模式：正常下发开始指令和手牌
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_STARTED\"}"));
                            if (room != null) {
                                for (com.game.poker.model.Player p : room.getPlayers()) {
                                    String cardsJson = objectMapper.writeValueAsString(p.getHandCards());
                                    sendToUser(roomId, p.getUserId(), new TextMessage("{\"event\": \"SYNC_HAND\", \"cards\": " + cardsJson + "}"));
                                }
                            }
                        }
                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    broadcastGameState(roomId);
                    break;

                case "REPLACE_CARD": {
                    if (gameMsg.getData() == null) return;
                    Card discardCard = objectMapper.convertValue(gameMsg.getData(), Card.class);
                    boolean replaceSuccess = gameService.replaceCard(roomId, userId, discardCard);
                    if (replaceSuccess) {
                        broadcastToRoom(roomId, new TextMessage("{\"event\": \"PLAYER_REPLACED\", \"userId\": \"" + userId + "\"}"));
                        // 【数据连接核心】：换牌成功后，将最新的手牌同步给该玩家
                        com.game.poker.model.Player p = gameService.getRoom(roomId).getPlayers().stream().filter(u -> u.getUserId().equals(userId)).findFirst().orElse(null);
                        if (p != null) {
                            String cardsJson = objectMapper.writeValueAsString(p.getHandCards());
                            sendToUser(roomId, userId, new TextMessage("{\"event\": \"SYNC_HAND\", \"cards\": " + cardsJson + "}"));
                        }
                    } else {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"换牌失败(可能已换过或非你的回合)\"}"));
                    }
                    broadcastGameState(roomId);
                    break;
                }
                // ====== 【新增：处理固守弃牌】 ======
                case "GUSHOU_DISCARD":
                    try {
                        List<Card> cards = objectMapper.convertValue(gameMsg.getData(), new com.fasterxml.jackson.core.type.TypeReference<List<Card>>(){});
                        for (Card c : cards) {
                            String animJson = objectMapper.writeValueAsString(c);
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"AOE_ANIMATION\", \"userId\": \"" + userId + "\", \"card\": " + animJson + "}"));
                        }
                        gameService.discardGushou(roomId, userId, cards);
                        syncPlayerHand(roomId, userId);

                        // ====== 【核心修复】：补上遗漏的游戏结束广播 ======
                        com.game.poker.model.Player gushouDiscardWinner = gameService.getRoom(roomId).getPlayers().stream()
                                .filter(p -> "WON".equals(p.getStatus())).findFirst().orElse(null);
                        if (gushouDiscardWinner != null) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + gushouDiscardWinner.getUserId() + "\", \"winningCards\": []}"));
                            GameRoom endRoom = gameService.getRoom(roomId);
                            if (endRoom != null) {
                                endRoom.setStarted(false); // 解锁准备按钮
                                endRoom.getPlayers().forEach(player -> player.setReady(false)); // 强行把所有人打回未准备状态
                            }
                        }

                        broadcastGameState(roomId);
                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    break;

                // ====== 【新增：主动使用固守】 ======
                case "USE_GUSHOU":
                    try {
                        gameService.useGushou(roomId, userId);
                        syncPlayerHand(roomId, userId);
                        broadcastToRoom(roomId, new TextMessage("{\"event\": \"SKILL_USED\", \"userId\": \"" + userId + "\", \"skillName\": \"GUSHOU\"}"));
                        // ====== 【核心修复】：补上遗漏的游戏结束广播 ======
                        com.game.poker.model.Player gushouWinner = gameService.getRoom(roomId).getPlayers().stream()
                                .filter(p -> "WON".equals(p.getStatus())).findFirst().orElse(null);
                        if (gushouWinner != null) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + gushouWinner.getUserId() + "\", \"winningCards\": []}"));
                            GameRoom endRoom = gameService.getRoom(roomId);
                            if (endRoom != null) {
                                endRoom.setStarted(false); // 解锁准备按钮
                                endRoom.getPlayers().forEach(player -> player.setReady(false)); // 强行把所有人打回未准备状态
                            }
                        }

                        broadcastGameState(roomId);
                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    break;
                case "PLAY_CARD":

                    if (gameMsg.getData() == null) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"缺少出牌数据\"}"));
                        return;
                    }
                    List<Card> playedCards = objectMapper.convertValue(
                            gameMsg.getData(),
                            objectMapper.getTypeFactory().constructCollectionType(List.class, Card.class)
                    );

                    boolean isAoe = playedCards.size() == 1 && "SCROLL".equals(playedCards.get(0).getSuit());

                    try {
                        boolean playSuccess = gameService.playCards(roomId, userId, playedCards);
                        if (playSuccess) {
                            // 【核心表现】：如果打出的是锦囊，不下发 CARDS_PLAYED，这样桌面的牌就不会变，依然保留上一手牌的模样！
                            if (!isAoe) {
                                String cardsJson = objectMapper.writeValueAsString(playedCards);
                                broadcastToRoom(roomId, new TextMessage("{\"event\": \"CARDS_PLAYED\", \"userId\": \"" + userId + "\", \"cards\": " + cardsJson + "}"));
                            } else {
                                String aoeRank = playedCards.get(0).getRank();

                                // ====== 【核心修复】：剥离借刀杀人，让其走 CARDS_PLAYED 通道供前端拦截 ======
                                if ("JDSR".equals(aoeRank)) {
                                    String cardsJson = objectMapper.writeValueAsString(playedCards);
                                    broadcastToRoom(roomId, new TextMessage("{\"event\": \"CARDS_PLAYED\", \"userId\": \"" + userId + "\", \"cards\": " + cardsJson + "}"));
                                } else {
                                    // 其他锦囊正常走 AOE 广播
                                    String aoeName = "NMRQ".equals(aoeRank) ? "南蛮入侵" : "WJQF".equals(aoeRank) ? "万箭齐发" : "五谷丰登";
                                    broadcastToRoom(roomId, new TextMessage("{\"event\": \"AOE_PLAYED\", \"userId\": \"" + userId + "\", \"aoeName\": \"" + aoeName + "\"}"));
                                }
                            }

                            com.game.poker.model.Player p = gameService.getRoom(roomId).getPlayers().stream().filter(u -> u.getUserId().equals(userId)).findFirst().orElse(null);
                            if (p != null) {
                                String handJson = objectMapper.writeValueAsString(p.getHandCards());
                                sendToUser(roomId, userId, new TextMessage("{\"event\": \"SYNC_HAND\", \"cards\": " + handJson + "}"));
                            }
                            if (p != null && "WON".equals(p.getStatus())) {
                                // 如果凭借最后一张锦囊赢了，底牌就下发一个空数组
                                String winCardsJson = objectMapper.writeValueAsString(isAoe ? new ArrayList<>() : playedCards);
                                broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + userId + "\", \"winningCards\": " + winCardsJson + "}"));
                                GameRoom endRoom = gameService.getRoom(roomId);
                                if (endRoom != null) {
                                    endRoom.setStarted(false); // 解锁准备按钮
                                    endRoom.getPlayers().forEach(player -> player.setReady(false)); // 强行把所有人打回未准备状态
                                }
                            }
                        } else {
                            session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"出牌不符合规则或未大过上一手\"}"));
                        }
                    } catch (Exception e) {
                        // 将后端抛出的“只能使用一次”、“只能自由出牌回合使用”的异常直接发给前端弹窗
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    broadcastGameState(roomId);
                    break;

                case "PASS":
                    // 【新增修改 4】：加上 try-catch，并下发 ROUND_RESET 指令
                    try {
                        gameService.passTurn(roomId, userId);
                        GameRoom currentRoom = gameService.getRoom(roomId);

                        if ("GUANXING".equals(currentRoom.getCurrentAoeType()) && currentRoom.getPendingAoePlayers().contains(userId)) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"SKILL_USED\", \"userId\": \"" + userId + "\", \"skillName\": \"GUANXING\"}"));
                            List<Card> fourCards = (List<Card>) currentRoom.getSettings().get("guanxingCards");
                            String cardsJson = objectMapper.writeValueAsString(fourCards);
                            sendToUser(roomId, userId, new TextMessage("{\"event\": \"GUANXING_SHOW\", \"cards\": " + cardsJson + "}"));
                            broadcastGameState(roomId);
                            break;
                        }
                        broadcastToRoom(roomId, new TextMessage("{\"event\": \"PLAYER_PASSED\", \"userId\": \"" + userId + "\"}"));
                        // 如果没有观星，正常执行过牌播报
                        // 摸了两张惩罚牌，需要把最新手牌同步给该玩家
                        syncPlayerHand(roomId, userId);

                        // 检查桌面是否已被清空（说明转了一圈都没人要）
                        if (gameService.getRoom(roomId).getLastPlayedCards().isEmpty()) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"ROUND_RESET\"}"));
                        }
                        com.game.poker.model.Player winner = gameService.getRoom(roomId).getPlayers().stream()
                                .filter(p -> "WON".equals(p.getStatus())).findFirst().orElse(null);
                        if (winner != null) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + winner.getUserId() + "\", \"winningCards\": []}"));
                            GameRoom endRoom = gameService.getRoom(roomId);
                            if (endRoom != null) {
                                endRoom.setStarted(false); // 解锁准备按钮
                                endRoom.getPlayers().forEach(player -> player.setReady(false)); // 强行把所有人打回未准备状态
                            }
                        }
                    } catch (Exception e) {
                        // 如果违反规则（比如自由出牌回合强行不出），给该玩家弹窗报错
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    broadcastGameState(roomId);
                    break;
                case "SEND_EMOJI":
                    if (gameMsg.getData() != null) {
                        String emojiFileName = gameMsg.getData().toString();
                        // 收到表情指令后，直接原样广播给房间里的所有人（包括发送者自己）
                        broadcastToRoom(roomId, new TextMessage("{\"event\": \"EMOJI_RECEIVED\", \"userId\": \"" + userId + "\", \"emoji\": \"" + emojiFileName + "\"}"));
                    }
                    break;

                case "READY":
                    gameService.toggleReady(roomId, userId);
                    broadcastGameState(roomId);
                    break;
                // 【新增】：接收房主的高级设置更新
                case "UPDATE_SETTINGS":
                    GameRoom sRoom = gameService.getRoom(roomId);
                    if (sRoom != null && sRoom.getOwnerId().equals(userId) && gameMsg.getData() != null) {
                        Map<String, Object> newSettings = (Map<String, Object>) gameMsg.getData();
                        sRoom.getSettings().putAll(newSettings);
                        broadcastGameState(roomId); // 广播给房间所有人
                    }
                    break;
                case "RETURN_TO_ROOM": {
                    GameRoom r = gameService.getRoom(roomId);
                    if (r != null) {
                        // 1. 把点击返回的玩家状态设为“大厅等待”
                        com.game.poker.model.Player p = r.getPlayers().stream().filter(u -> u.getUserId().equals(userId)).findFirst().orElse(null);
                        if (p != null) {
                            p.setStatus("WAITING");
                            p.setReady(false); // 自己返回大厅，重置为未准备
                        }

                        // 2. 检查是否所有还在房间里的活人玩家，都已经返回了等待大厅
                        boolean allWaiting = r.getPlayers().stream()
                                .filter(player -> !player.isDisconnected())
                                .allMatch(player -> "WAITING".equals(player.getStatus()));

                        if (allWaiting) {
                            // 大家都回去了，彻底打扫战场清理卡牌
                            gameService.returnToWaitingRoom(roomId);
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"ROOM_RESET\"}"));
                        } else {
                            // 还有人没回去，只给点击返回的这个人定向发送重置指令！
                            sendToUser(roomId, userId, new TextMessage("{\"event\": \"ROOM_RESET\"}"));
                        }
                        broadcastGameState(roomId);
                    }
                    break;
                }
                case "SELECT_SKILL":{
                    String selectedSkill = gameMsg.getData().toString();
                    GameRoom r = gameService.getRoom(roomId);
                    Map<String, String> skills = (Map<String, String>) r.getSettings().get("skillsSelected");
                    skills.put(userId, selectedSkill);

                    com.game.poker.model.Player pl = r.getPlayers().stream().filter(p -> p.getUserId().equals(userId)).findFirst().orElse(null);
                    if (pl != null) pl.setSkill(selectedSkill);

                    // 如果所有人都选完了，直接开始！
                    if (skills.size() == r.getPlayers().size()) {
                        gameService.doStartGame(r);
                        broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_STARTED\"}"));
                        for (com.game.poker.model.Player p : r.getPlayers()) {
                            String cardsJson = objectMapper.writeValueAsString(p.getHandCards());
                            sendToUser(roomId, p.getUserId(), new TextMessage("{\"event\": \"SYNC_HAND\", \"cards\": " + cardsJson + "}"));
                        }
                    }
                    broadcastGameState(roomId);
                    break;}

                // ====== 【新增：使用新技能】 ======
                case "USE_SKILL":{
                    Map<String, Object> skillData = (Map<String, Object>) gameMsg.getData();
                    String skillName = (String) skillData.get("skill");
                    try {
                        if ("LUANJIAN".equals(skillName)) {
                            List<Card> cards = objectMapper.convertValue(skillData.get("cards"), new com.fasterxml.jackson.core.type.TypeReference<List<Card>>(){});
                            gameService.useLuanjian(roomId, userId, cards);
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"SKILL_USED\", \"userId\": \"" + userId + "\", \"skillName\": \"LUANJIAN\"}"));
                        } else if ("GUANXING".equals(skillName)) {
                            // 【新增】：拦截明面的观星按钮点击，直接引流给 passTurn
                            gameService.passTurn(roomId, userId);
                            GameRoom currentRoom = gameService.getRoom(roomId);
                            if ("GUANXING".equals(currentRoom.getCurrentAoeType()) && currentRoom.getPendingAoePlayers().contains(userId)) {
                                broadcastToRoom(roomId, new TextMessage("{\"event\": \"SKILL_USED\", \"userId\": \"" + userId + "\", \"skillName\": \"GUANXING\"}"));
                                List<Card> fourCards = (List<Card>) currentRoom.getSettings().get("guanxingCards");
                                String cardsJson = objectMapper.writeValueAsString(fourCards);
                                sendToUser(roomId, userId, new TextMessage("{\"event\": \"GUANXING_SHOW\", \"cards\": " + cardsJson + "}"));
                            }
                        }
                        syncPlayerHand(roomId, userId);// 【核心修复】：无论放什么技能，强刷全场手牌！
                        broadcastGameState(roomId);
                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    break;
                }
                // ====== 【新增：五谷丰登选牌确认】 ======
                case "WGFD_SELECT":
                    try {
                        Card selectedCard = objectMapper.convertValue(gameMsg.getData(), Card.class);
                        gameService.resolveWgfd(roomId, userId, selectedCard);
                        syncPlayerHand(roomId, userId);

                        // 检查拿完牌后有没有人爆仓直接结束游戏
                        GameRoom rAfter = gameService.getRoom(roomId);
                        com.game.poker.model.Player wgfdWinner = rAfter.getPlayers().stream().filter(p -> "WON".equals(p.getStatus())).findFirst().orElse(null);
                        if (wgfdWinner != null) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + wgfdWinner.getUserId() + "\", \"winningCards\": []}"));
                            rAfter.setStarted(false);
                            rAfter.getPlayers().forEach(player -> player.setReady(false));
                        }
                        broadcastGameState(roomId);
                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    break;
                // ====== 【新增：观星选牌确认】 ======

                case "GUANXING_SELECT":
                    try {
                        List<Card> selectedCards = objectMapper.convertValue(gameMsg.getData(), new com.fasterxml.jackson.core.type.TypeReference<List<Card>>(){});
                        gameService.resolveGuanxing(roomId, userId, selectedCards);
                        GameRoom roomAfter = gameService.getRoom(roomId);

                        // 观星选完牌后，告诉全场你相当于执行了一次“要不起”
                        broadcastToRoom(roomId, new TextMessage("{\"event\": \"PLAYER_PASSED\", \"userId\": \"" + userId + "\"}"));
                        syncPlayerHand(roomId, userId);
                        if (roomAfter.getLastPlayedCards().isEmpty() && roomAfter.getCurrentAoeType() == null) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"ROUND_RESET\"}"));
                        }
                        com.game.poker.model.Player pWinner = roomAfter.getPlayers().stream().filter(p -> "WON".equals(p.getStatus())).findFirst().orElse(null);
                        if (pWinner != null) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + pWinner.getUserId() + "\", \"winningCards\": []}"));
                            roomAfter.setStarted(false);
                            roomAfter.getPlayers().forEach(player -> player.setReady(false));
                        }
                        broadcastGameState(roomId);
                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    break;
                case "KICK_PLAYER":
                    String targetId = gameMsg.getData().toString();
                    gameService.kickPlayer(roomId, userId, targetId);
                    // 单独给房间所有人广播踢人事件，前端匹配到了 targetId 就会自己断开
                    broadcastToRoom(roomId, new TextMessage("{\"event\": \"KICKED\", \"targetId\": \"" + targetId + "\"}"));
                    broadcastGameState(roomId);
                    break;
                // 【新增】：处理锦囊牌响应
                // 【修改】：处理锦囊牌响应，增加异常拦截与特效播报
                case "RESPOND_AOE":{
                    Card discardCard = null;
                    if (gameMsg.getData() != null) {
                        discardCard = objectMapper.convertValue(gameMsg.getData(), Card.class);
                    }
                    try {
                        gameService.respondAoe(roomId, userId, discardCard);
                        GameRoom currentRoom = gameService.getRoom(roomId);

                        // ====== 【核心修复】：删除了冗余的 GUANXING 判断，直接走正常的出牌播报 ======

                        if (discardCard != null) {
                            // 如果成功弃牌，广播飞牌动画事件
                            String animJson = objectMapper.writeValueAsString(discardCard);
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"AOE_ANIMATION\", \"userId\": \"" + userId + "\", \"card\": " + animJson + "}"));
                        } else {
                            // 如果不弃牌（被罚摸两张），全服广播“要不起”动画特效！
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"PLAYER_PASSED\", \"userId\": \"" + userId + "\"}"));
                        }

                        // 刷新自己手牌
                        syncPlayerHand(roomId, userId);
                        // 检测是否有人因为爆仓产生赢家
                        com.game.poker.model.Player aoeWinner = gameService.getRoom(roomId).getPlayers().stream()
                                .filter(p -> "WON".equals(p.getStatus())).findFirst().orElse(null);
                        if (aoeWinner != null) {
                            broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + aoeWinner.getUserId() + "\", \"winningCards\": []}"));
                            GameRoom endRoom = gameService.getRoom(roomId);
                            if (endRoom != null) {
                                endRoom.setStarted(false); // 解锁准备按钮
                                endRoom.getPlayers().forEach(player -> player.setReady(false)); // 强行把所有人打回未准备状态
                            }
                        }
                        broadcastGameState(roomId);

                    } catch (Exception e) {
                        session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"" + e.getMessage() + "\"}"));
                    }
                    break;
                }
                // ====== 【新增】：超级管理员强制解散指令 ======
                case "DISBAND_ROOM":
                    if ("room_manager".equals(userId)) {
                        GameRoom roomToDisband = gameService.getRoomMap().remove(roomId);
                        if (roomToDisband != null) {
                            // 遍历房间里的所有人（包括玩家和旁观者），给他们群发 KICKED 指令强行清退！
                            for (com.game.poker.model.Player p : roomToDisband.getPlayers()) {
                                sendToUser(roomId, p.getUserId(), new TextMessage("{\"event\": \"KICKED\", \"targetId\": \"" + p.getUserId() + "\"}"));
                            }
                            for (String spec : roomToDisband.getSpectators()) {
                                sendToUser(roomId, spec, new TextMessage("{\"event\": \"KICKED\", \"targetId\": \"" + spec + "\"}"));
                            }
                            log.info("🚨 房间 [{}] 已被超级管理员强制解散并清空！", roomId);
                        }
                    }
                    break;

                default:
                    session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"未知的指令类型: " + type + "\"}"));
            }
        } catch (Exception e) {
            log.error("处理玩家 [{}] 的请求时发生服务器内部错误", userId, e);
            if (session.isOpen()) {
                session.sendMessage(new TextMessage("{\"event\": \"ERROR\", \"msg\": \"服务器内部错误，请检查请求参数是否完整\"}"));
            }
        }
    }

    // --- 新增：处理游戏强行中止 ---
//    private void handleGameAbort(String roomId, String causeUser) throws Exception {
//        // 重置游戏，踢出掉线玩家
//        gameService.resetGame(roomId, causeUser);
//        // 通知剩下的玩家：游戏结束，回到大厅
//        broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_ABORTED\", \"msg\": \"玩家 [" + causeUser + "] 断开连接/退出了房间。当前对局已中止，已返回等待大厅。\"}"));
//        broadcastGameState(roomId); // 同步最新的大厅状态
//    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String userId = sessionUserMap.remove(session.getId());
        if (userId != null) {
            for (Map.Entry<String, CopyOnWriteArraySet<WebSocketSession>> entry : roomSessions.entrySet()) {
                if (entry.getValue().contains(session)) {
                    String roomId = entry.getKey();
                    entry.getValue().remove(session);

                    try {
                        GameRoom room = gameService.getRoom(roomId);
                        if (room != null) {
                            com.game.poker.model.Player p = room.getPlayers().stream().filter(u -> u.getUserId().equals(userId)).findFirst().orElse(null);
                            boolean isPlaying = room.isStarted() && p != null && "PLAYING".equals(p.getStatus());

                            gameService.safeLeaveRoom(roomId, userId);

                            if (isPlaying) {
                                broadcastToRoom(roomId, new TextMessage("{\"event\": \"ERROR\", \"msg\": \"玩家 [" + userId + "] 中途逃跑，已被自动淘汰！\"}"));

                                com.game.poker.model.Player winner = room.getPlayers().stream()
                                        .filter(player -> "WON".equals(player.getStatus())).findFirst().orElse(null);
                                if (winner != null) {
                                    broadcastToRoom(roomId, new TextMessage("{\"event\": \"GAME_OVER\", \"winner\": \"" + winner.getUserId() + "\", \"winningCards\": []}"));
                                    GameRoom endRoom = gameService.getRoom(roomId);
                                    if (endRoom != null) {
                                        endRoom.setStarted(false); // 解锁准备按钮
                                        endRoom.getPlayers().forEach(player -> player.setReady(false)); // 强行把所有人打回未准备状态
                                    }
                                } else if (room.getLastPlayedCards().isEmpty()) {
                                    // 桌面被清空，通知下一个人自由出牌
                                    broadcastToRoom(roomId, new TextMessage("{\"event\": \"ROUND_RESET\"}"));
                                }
                            }

                            // 恢复旧版，只做基础的状态广播
                            broadcastGameState(roomId);
                        }
                    } catch (Exception e) {
                        log.error("处理退出失败", e);
                    }
                    break;
                }
            }
        }
    }

    // --- 广播辅助方法 ---
    private void addSessionToRoom(String roomId, WebSocketSession session) {
        roomSessions.computeIfAbsent(roomId, k -> new CopyOnWriteArraySet<>()).add(session);
    }

    private void broadcastToRoom(String roomId, TextMessage message) throws Exception {
        CopyOnWriteArraySet<WebSocketSession> sessions = roomSessions.get(roomId);
        if (sessions != null) {
            for (WebSocketSession s : sessions) {
                if (s.isOpen()) {
                    s.sendMessage(message);
                }
            }
        }
    }
    // --- 新增：仅向指定玩家定向发送消息（保护手牌隐私） ---
    private void sendToUser(String roomId, String userId, TextMessage message) throws Exception {
        CopyOnWriteArraySet<WebSocketSession> sessions = roomSessions.get(roomId);
        if (sessions != null) {
            for (WebSocketSession s : sessions) {
                // 找到该玩家对应的专属连接
                if (userId.equals(sessionUserMap.get(s.getId())) && s.isOpen()) {
                    s.sendMessage(message);
                }
            }
        }
    }
    private void broadcastGameState(String roomId) throws Exception {
        GameRoom room = gameService.getRoom(roomId);
        if (room == null) return;

        if (Boolean.TRUE.equals(room.getSettings().get("justShuffled"))) {
            broadcastToRoom(roomId, new TextMessage("{\"event\": \"DECK_SHUFFLED\"}"));
            room.getSettings().remove("justShuffled"); // 播完立刻擦除标记，防止重复播
        }

        if (room.getSettings().containsKey("cardWarningUserId")) {
            String warningUserId = (String) room.getSettings().get("cardWarningUserId");
            int warningCount = (Integer) room.getSettings().get("cardWarningCount");
            broadcastToRoom(roomId, new TextMessage(
                    "{\"event\": \"CARD_WARNING\", \"userId\": \"" + warningUserId + "\", \"count\": " + warningCount + "}"
            ));
            // 播完立刻擦除，防止重复播报
            room.getSettings().remove("cardWarningUserId");
            room.getSettings().remove("cardWarningCount");
        }

        List<Map<String, Object>> playersInfo = new ArrayList<>();
        for (com.game.poker.model.Player p : room.getPlayers()) {
            Map<String, Object> pInfo = new java.util.HashMap<>();
            pInfo.put("userId", p.getUserId());
            pInfo.put("cardCount", p.getHandCards().size()); // 只发数量，不发具体的牌
            pInfo.put("status", p.getStatus());
            pInfo.put("isReady", p.isReady());
            pInfo.put("skill", p.getSkill());
            playersInfo.add(pInfo);
        }

        // ====== 声明 state 对象 ======
        Map<String, Object> state = new java.util.HashMap<>();
        state.put("event", "SYNC_STATE");
        state.put("ownerId", room.getOwnerId());
        state.put("serverTime", System.currentTimeMillis());
        state.put("currentTurnStartTime", room.getCurrentTurnStartTime());

        // ====== 【核心优化与修复：白名单极致瘦身，彻底消除序列化卡顿】 ======
        Map<String, Object> safeSettings = new java.util.HashMap<>();
        safeSettings.put("enableScrollCards", room.getSettings().get("enableScrollCards"));
        safeSettings.put("enableWildcard", room.getSettings().get("enableWildcard"));
        safeSettings.put("enableSkills", room.getSettings().get("enableSkills"));
        safeSettings.put("skillsSelected", room.getSettings().get("skillsSelected"));

        // 仅在五谷丰登与借刀杀人发生时，动态透传必需的提示数据，绝不发送底牌！
        if ("WGFD".equals(room.getCurrentAoeType())) {
            safeSettings.put("wgfdCards", room.getSettings().get("wgfdCards"));
            safeSettings.put("wgfdQueue", room.getSettings().get("wgfdQueue"));
        }
        if (room.getSettings().containsKey("jdsr_target")) {
            safeSettings.put("jdsr_target", room.getSettings().get("jdsr_target"));
            safeSettings.put("jdsr_initiator", room.getSettings().get("jdsr_initiator"));
        }

        state.put("settings", safeSettings);

        // ====== 【核心修复】：增加越界安全保护，防止玩家退出后索引错位崩溃 ======
        String currentTurnUser = "";
        if (!room.getPlayers().isEmpty()) {
            int safeIndex = room.getCurrentTurnIndex();
            if (safeIndex >= 0 && safeIndex < room.getPlayers().size()) {
                currentTurnUser = room.getPlayers().get(safeIndex).getUserId();
            } else {
                currentTurnUser = room.getPlayers().get(0).getUserId(); // 越界兜底
            }
        }

        state.put("currentTurn", currentTurnUser);
        state.put("players", playersInfo);
        state.put("spectators", room.getSpectators());
        state.put("isStarted", room.isStarted());
        state.put("tableCards", room.getLastPlayedCards());
        state.put("lastPlayPlayer", room.getLastPlayPlayerId());
        state.put("currentAoeType", room.getCurrentAoeType());
        state.put("pendingAoePlayers", room.getPendingAoePlayers());
        state.put("aoeStartTime", room.getAoeStartTime());
        state.put("aoeInitiator", room.getAoeInitiator());
        state.put("luanjianInitiator", room.getSettings().get("luanjian_initiator"));

        broadcastToRoom(roomId, new TextMessage(objectMapper.writeValueAsString(state)));
    }
    // ====== 【新增：全场手牌强制同步器】 ======
    private void syncAllHands(String roomId) throws Exception {
        GameRoom room = gameService.getRoom(roomId);
        if (room != null) {
            for (com.game.poker.model.Player p : room.getPlayers()) {
                String handJson = objectMapper.writeValueAsString(p.getHandCards());
                sendToUser(roomId, p.getUserId(), new TextMessage("{\"event\": \"SYNC_HAND\", \"cards\": " + handJson + "}"));
            }
        }
    }
    // ====== 【性能优化：精准定向手牌同步，拒绝全局发包】 ======
    private void syncPlayerHand(String roomId, String userId) throws Exception {
        GameRoom room = gameService.getRoom(roomId);
        if (room != null) {
            com.game.poker.model.Player p = room.getPlayers().stream().filter(u -> u.getUserId().equals(userId)).findFirst().orElse(null);
            if (p != null) {
                String handJson = objectMapper.writeValueAsString(p.getHandCards());
                sendToUser(roomId, userId, new TextMessage("{\"event\": \"SYNC_HAND\", \"cards\": " + handJson + "}"));
            }
        }
    }
}