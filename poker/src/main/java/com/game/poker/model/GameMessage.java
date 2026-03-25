package com.game.poker.model;

import lombok.Data;

/**
 * 前后端通信的统一消息体
 */
@Data
public class GameMessage {
    private String type;     // 消息类型，例如："JOIN_ROOM", "PLAY_CARD", "PASS", "REPLACE_CARD"
    private String roomId;   // 房间号
    private String userId;   // 发送方用户ID
    private Object data;     // 具体的数据载荷（如出牌的列表、替换的卡牌等），可转为 Map 或 List
}