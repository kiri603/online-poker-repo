package com.game.poker.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Card {
    private String suit; // 花色：♠黑桃, ♥红桃, ♣梅花, ♦方块
    private String rank; // 牌面：3, 4, ... J, Q, K, A, 2
    private int weight;  // 权重：用于比较大小，3=1, 4=2 ... 2=13
    private static final Map<String, Card> CARD_POOL = new ConcurrentHashMap<>();
    public static Card getCard(String suit, String rank, int weight) {
        // 使用花色和牌面拼接作为唯一标识 (例如："♠_3", "SCROLL_JDSR")
        String key = suit + "_" + rank;
        return CARD_POOL.computeIfAbsent(key, k -> new Card(suit, rank, weight));
    }
    @Override
    public String toString() {
        return suit + rank;
    }
}