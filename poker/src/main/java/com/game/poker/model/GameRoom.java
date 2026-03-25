package com.game.poker.model;

import lombok.Data;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Data
public class GameRoom {
    private String roomId;                  // 房间号
    private List<Player> players;           // 房间内的玩家
    private List<Card> deck;                // 牌堆（剩余未摸的牌）
    private List<Card> discardPile;         // 弃牌堆（玩家回合前弃置的牌）

    private boolean privateRoom = false;
    private String password = "";

    public boolean isPrivateRoom() { return privateRoom; }
    public void setPrivateRoom(boolean privateRoom) { this.privateRoom = privateRoom; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    private int currentTurnIndex;           // 当前轮到的玩家索引
    private List<Card> lastPlayedCards;     // 桌面上的最新一手牌
    private String lastPlayPlayerId;        // 打出最新一手牌的玩家ID
    // 新增这两个属性
    private boolean started = false; // 游戏是否已开始
    private List<String> spectators = new java.util.concurrent.CopyOnWriteArrayList<>(); // 旁观者名单
    private List<Card> tableCards = new ArrayList<>();
    private String lastPlayUserId = "";
    private String phase = "WAITING"; // WAITING, SKILL_SELECTION, PLAYING
    public String getPhase() { return phase; }
    public void setPhase(String phase) { this.phase = phase; }

    // 【新增】：房主 ID
    private String ownerId;
    private String currentAoeType = null; // 当前正在结算的锦囊："NMRQ" 或 "WJQF"
    private java.util.Set<String> pendingAoePlayers = new java.util.concurrent.CopyOnWriteArraySet<>(); // 需要弃牌的玩家集合
    private long aoeStartTime = 0; // 锦囊回合开始的时间戳
    private String aoeInitiator = "";
    public String getAoeInitiator() { return aoeInitiator; }
    public void setAoeInitiator(String aoeInitiator) { this.aoeInitiator = aoeInitiator; }

    public String getCurrentAoeType() { return currentAoeType; }
    public void setCurrentAoeType(String currentAoeType) { this.currentAoeType = currentAoeType; }
    public java.util.Set<String> getPendingAoePlayers() { return pendingAoePlayers; }
    public void setPendingAoePlayers(java.util.Set<String> pendingAoePlayers) { this.pendingAoePlayers = pendingAoePlayers; }
    public long getAoeStartTime() { return aoeStartTime; }
    public void setAoeStartTime(long aoeStartTime) { this.aoeStartTime = aoeStartTime; }
    // 【新增】：房间高级设置（高度可扩展，前端传什么键值对这里就存什么）
    private java.util.Map<String, Object> settings = new java.util.concurrent.ConcurrentHashMap<>();
    public java.util.Map<String, Object> getSettings() { return settings; }
    public void setSettings(java.util.Map<String, Object> settings) { this.settings = settings; }
    public String getOwnerId() { return ownerId; }
    public void setOwnerId(String ownerId) { this.ownerId = ownerId; }

    public String getLastPlayUserId() { return lastPlayUserId; }
    public void setLastPlayUserId(String lastPlayUserId) { this.lastPlayUserId = lastPlayUserId; }
    private long currentTurnStartTime = System.currentTimeMillis();
    public long getCurrentTurnStartTime() { return currentTurnStartTime; }
    public void setCurrentTurnStartTime(long currentTurnStartTime) { this.currentTurnStartTime = currentTurnStartTime; }

    public GameRoom(String roomId) {
        this.roomId = roomId;
        this.players = new ArrayList<>();
        this.deck = new ArrayList<>();
        this.discardPile = new ArrayList<>();
        this.lastPlayedCards = new ArrayList<>();
        initDeck(); // 创建房间时自动初始化牌堆
    }

    // 初始化一副52张的标准扑克牌并洗牌（不含大小王）
    public void initDeck() {
        String[] suits = {"♠", "♥", "♣", "♦"};
        String[] ranks = {"3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"};

        // ====== 【性能优化：从卡牌池获取引用，实现零对象创建】 ======
        for (String suit : suits) {
            for (int i = 0; i < ranks.length; i++) {
                // i+1 即为权重。把 new Card 替换为 Card.getCard
                deck.add(Card.getCard(suit, ranks[i], i + 1));
            }
        }
        // 添加大小王 (权重分别为 14 和 15)
        deck.add(Card.getCard("JOKER", "小王", 14));
        deck.add(Card.getCard("JOKER", "大王", 15));

        // 洗牌：使用 Java 自带的集合工具类打乱顺序（打乱的只是引用指针，不消耗内存）
        Collections.shuffle(deck);
    }
}