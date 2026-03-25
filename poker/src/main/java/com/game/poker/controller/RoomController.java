package com.game.poker.controller;

import com.game.poker.model.GameRoom;
import com.game.poker.service.GameService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin // 允许跨域请求
public class RoomController {

    @Autowired
    private GameService gameService;

    @GetMapping
    public List<Map<String, Object>> getPublicRooms() {
        List<Map<String, Object>> list = new ArrayList<>();
        // 获取所有房间，过滤掉私密房间
        for (GameRoom room : gameService.getAllRooms()) {
            if (!room.isPrivateRoom()) {
                Map<String, Object> map = new HashMap<>();
                map.put("roomId", room.getRoomId());
                map.put("playerCount", room.getPlayers().size());
                map.put("status", room.isStarted() ? "PLAYING" : "WAITING");
                list.add(map);
            }
        }
        return list;
    }
    // ====== 【新增】：房间状态预检接口 ======
    @GetMapping("/check")
    public Map<String, Object> checkRoom(@RequestParam String roomId) {
        com.game.poker.model.GameRoom room = gameService.getRoomMap().get(roomId);
        Map<String, Object> response = new HashMap<>();
        if (room != null) {
            response.put("exists", true);
            response.put("isPrivate", room.isPrivateRoom());
        } else {
            response.put("exists", false);
        }
        return response;
    }
}